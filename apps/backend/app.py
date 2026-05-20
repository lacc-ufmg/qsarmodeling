from __future__ import annotations

from dataclasses import dataclass
import multiprocessing
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Optional
from uuid import uuid4
import shutil

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uvicorn import run

from qsarmodelingpy.utils import load_matrix
from qsarmodelingpy.models.ga import Ga
from qsarmodelingpy.models.ops import OPS
from qsarmodelingpy.utils.filter import filter_matrix
from qsarmodelingpy.utils.kennard_stone import kennard_stone_algorithm
from qsarmodelingpy.validation.cross_validation import CrossValidation
from qsarmodelingpy.validation.external_validation import ExternalValidation
from qsarmodelingpy.validation.pipelines.full_validation import (
    run_leavenout,
    run_yrandomization,
    validate,
)


app = FastAPI(title="QSAR Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FilterSettings(BaseModel):
    varCut: float
    corrCut: float
    autocorrCut: float
    autoscale: bool
    ljTransform: bool


class SelectionSettings(BaseModel):
    method: str
    latentVarsModel: int
    latentVarsOps: Optional[int] = None
    varsPercentage: int
    minVarsModel: int
    maxVarsModel: int
    populationSize: int
    generations: int


class ValidationSettings(BaseModel):
    runCrossValidation: bool
    runYRandomization: bool
    runLNO: bool
    runExternalValidation: bool
    yrandCutoff: float
    lnoCutoff: float
    testSetRatio: float


class DatasetProfile(BaseModel):
    sessionId: str
    id: str
    matrixName: str
    vectorName: str
    rows: int
    descriptors: int
    source: str


class SelectionResult(BaseModel):
    sessionId: str
    method: str
    selectedDescriptors: int
    latentVariables: int
    q2: float
    r2: float
    validationPassed: bool


class CVResult(BaseModel):
    q2: float
    rmse: float


class YRResult(BaseModel):
    score: float
    passed: bool


class LNOResult(BaseModel):
    score: float
    passed: bool


class EXTResult(BaseModel):
    r2Pred: float
    rmsep: float


class ValidationResult(BaseModel):
    cv: Optional[CVResult] = None
    yr: Optional[YRResult] = None
    lno: Optional[LNOResult] = None
    ext: Optional[EXTResult] = None


class SelectionRequest(BaseModel):
    filterSettings: FilterSettings
    selectionSettings: SelectionSettings


class ValidationRequest(BaseModel):
    validationSettings: ValidationSettings


class PipelineRequest(BaseModel):
    filterSettings: FilterSettings
    selectionSettings: SelectionSettings
    validationSettings: ValidationSettings


@dataclass
class SessionState:
    session_id: str
    directory: Path
    matrix_path: Path
    vector_path: Path
    matrix_name: str
    vector_name: str
    original_df: pd.DataFrame
    y: np.ndarray
    selected_df: pd.DataFrame | None = None
    selection_result: SelectionResult | None = None


SESSIONS: dict[str, SessionState] = {}


def _load_df_from_upload(upload: UploadFile, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)
    return destination


def _require_session(session_id: str) -> SessionState:
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown session. Load a dataset first.")
    return session


def _filtered_dataframe(session: SessionState, settings: FilterSettings) -> pd.DataFrame:
    filtered = filter_matrix(
        session.original_df,
        session.y,
        lj_transform=settings.ljTransform,
        var_cut=settings.varCut,
        corr_cut=settings.corrCut,
        auto_corrcut=settings.autocorrCut,
    )
    if filtered.shape[1] == 0:
        raise HTTPException(status_code=400, detail="Filtering removed every descriptor.")
    return filtered


def _cross_validation_summary(X: pd.DataFrame, y: np.ndarray) -> tuple[int, float, float]:
    cv = CrossValidation(X, y)
    q2_values = cv.Q2()
    r2_values = cv.R2()
    best_nlv = int(np.argmax(q2_values) + 1)
    q2 = float(q2_values[best_nlv - 1])
    r2 = float(r2_values[best_nlv - 1])
    return best_nlv, q2, r2


def _selection_summary(selected_df: pd.DataFrame, y: np.ndarray, method: str, validation_passed: bool, session_id: str) -> SelectionResult:
    nlv, q2, r2 = _cross_validation_summary(selected_df, y)
    return SelectionResult(
        sessionId=session_id,
        method=method,
        selectedDescriptors=int(selected_df.shape[1]),
        latentVariables=nlv,
        q2=q2,
        r2=r2,
        validationPassed=validation_passed,
    )


def _run_ops(
    session: SessionState,
    filtered_df: pd.DataFrame,
    settings: SelectionSettings,
    scale: bool,
) -> tuple[pd.DataFrame, bool]:
    try:
        y = session.y
        ops = OPS(
            filtered_df,
            pd.DataFrame(y),
            nLV=settings.latentVarsOps or None,
            nLVModel=settings.latentVarsModel or None,
            window=2,
            increment=1,
            percentage=settings.varsPercentage,
            nModels=25,
            scale=scale,
        )
        ops.runOPS()
        if len(ops.models["Q2"]) == 0:
            raise HTTPException(
                status_code=400,
                detail="OPS did not produce any candidate models. Increase varsPercentage or relax the filters.",
            )
        passing_indices = validate(
            filtered_df.values,
            y,
            ops.models["var_sel"],
            ops.models["Q2"],
            yr_cut=0.3,
            lno_cut=0.1,
        )
        ranked_candidates = [
            ops.models["var_sel"][index]
            for index in np.argsort(-np.asarray(ops.models["Q2"]))
        ]
        if passing_indices:
            ranked_candidates = [passing_indices] + [
                candidate for candidate in ranked_candidates if candidate != passing_indices
            ]
        for candidate in ranked_candidates:
            selected_df = filtered_df.iloc[:, candidate]
            try:
                _cross_validation_summary(selected_df, y)
                return selected_df, bool(passing_indices and candidate == passing_indices)
            except np.linalg.LinAlgError:
                continue
        raise HTTPException(
            status_code=400,
            detail="OPS could not find a stable candidate model for this dataset.",
        )
    except np.linalg.LinAlgError as exc:
        raise HTTPException(
            status_code=400,
            detail="OPS failed because the filtered matrix is singular. Try fewer correlated descriptors or a different dataset.",
        ) from exc


def _run_ga(
    session: SessionState,
    filtered_df: pd.DataFrame,
    settings: SelectionSettings,
    scale: bool,
) -> tuple[pd.DataFrame, bool]:
    try:
        y = session.y
        max_latent = settings.latentVarsModel or int(filtered_df.shape[0] / 5)
        ga = Ga(
            filtered_df,
            pd.DataFrame(y),
            nLV=max_latent,
            scale=scale,
            min_size=settings.minVarsModel,
            max_size=settings.maxVarsModel,
            size_population=settings.populationSize,
            mig_rate=0.2,
            cxpb=0.5,
            mutpb=0.2,
            ngen=settings.generations,
        )
        ga.run()
        q2_values = [float(item[0]) for item in ga.Q2]
        if not q2_values:
            raise HTTPException(
                status_code=400,
                detail="GA did not produce any candidate models. Increase the population or relax the filters.",
            )
        passing_indices = validate(filtered_df.values, y, ga.pop_selected, q2_values, yr_cut=0.3, lno_cut=0.1)
        ranked_candidates = [ga.pop_selected[index] for index in np.argsort(-np.asarray(q2_values))]
        if passing_indices:
            ranked_candidates = [passing_indices] + [
                candidate for candidate in ranked_candidates if candidate != passing_indices
            ]
        for candidate in ranked_candidates:
            selected_df = filtered_df.iloc[:, candidate]
            try:
                _cross_validation_summary(selected_df, y)
                return selected_df, bool(passing_indices and candidate == passing_indices)
            except np.linalg.LinAlgError:
                continue
        raise HTTPException(
            status_code=400,
            detail="GA could not find a stable candidate model for this dataset.",
        )
    except np.linalg.LinAlgError as exc:
        raise HTTPException(
            status_code=400,
            detail="GA failed because the filtered matrix is singular. Try fewer correlated descriptors or a different dataset.",
        ) from exc


@app.post("/load", response_model=DatasetProfile)
async def load_dataset(
    matrix_file: UploadFile = File(...),
    vector_file: UploadFile = File(...),
) -> DatasetProfile:
    if not matrix_file.filename or not vector_file.filename:
        raise HTTPException(status_code=400, detail="Both matrix and vector files are required.")
    session_id = uuid4().hex
    session_dir = Path("/tmp") / f"qsarkit-{session_id}"
    session_dir.mkdir(parents=True, exist_ok=True)

    matrix_path = _load_df_from_upload(matrix_file, session_dir / matrix_file.filename)
    vector_path = _load_df_from_upload(vector_file, session_dir / vector_file.filename)

    original_df = load_matrix(str(matrix_path))
    y = pd.read_csv(vector_path, header=None).values

    if original_df.shape[0] != len(y):
      raise HTTPException(status_code=400, detail="Matrix row count does not match the y vector length.")

    SESSIONS[session_id] = SessionState(
        session_id=session_id,
        directory=session_dir,
        matrix_path=matrix_path,
        vector_path=vector_path,
        matrix_name=matrix_file.filename,
        vector_name=vector_file.filename,
        original_df=original_df,
        y=y,
    )

    return DatasetProfile(
        sessionId=session_id,
        id=f"dataset-{session_id}",
        matrixName=matrix_file.filename,
        vectorName=vector_file.filename,
        rows=int(original_df.shape[0]),
        descriptors=int(original_df.shape[1]),
        source="uploaded",
    )


@app.post("/sessions/{session_id}/filters", response_model=DatasetProfile)
def run_filters(session_id: str, settings: FilterSettings) -> DatasetProfile:
    session = _require_session(session_id)
    filtered_df = _filtered_dataframe(session, settings)
    session.selected_df = None
    session.selection_result = None
    return DatasetProfile(
        sessionId=session_id,
        id=f"dataset-{session_id}-filtered",
        matrixName=session.matrix_name,
        vectorName=session.vector_name,
        rows=int(filtered_df.shape[0]),
        descriptors=int(filtered_df.shape[1]),
        source="filtered",
    )


@app.post("/sessions/{session_id}/selection", response_model=SelectionResult)
def run_selection(session_id: str, payload: SelectionRequest) -> SelectionResult:
    session = _require_session(session_id)
    filtered_df = _filtered_dataframe(session, payload.filterSettings)

    if payload.selectionSettings.method == "ops":
        selected_df, validation_passed = _run_ops(
            session,
            filtered_df,
            payload.selectionSettings,
            payload.filterSettings.autoscale,
        )
        result = _selection_summary(selected_df, session.y, "ops", validation_passed, session_id)
    elif payload.selectionSettings.method == "ga":
        selected_df, validation_passed = _run_ga(
            session,
            filtered_df,
            payload.selectionSettings,
            payload.filterSettings.autoscale,
        )
        result = _selection_summary(selected_df, session.y, "ga", validation_passed, session_id)
    else:
        raise HTTPException(status_code=400, detail="Unsupported selection method.")

    session.selected_df = selected_df
    session.selection_result = result
    return result


@app.post("/sessions/{session_id}/validate", response_model=ValidationResult)
def run_validations(session_id: str, payload: ValidationRequest) -> ValidationResult:
    try:
        session = _require_session(session_id)
        if session.selected_df is None or session.selection_result is None:
            raise HTTPException(status_code=400, detail="Run selection before validation.")

        selected_df = session.selected_df
        y = session.y
        validation_settings = payload.validationSettings
        result = ValidationResult()

        cv = None
        cv_nlv = None
        if validation_settings.runCrossValidation or validation_settings.runYRandomization or validation_settings.runLNO or validation_settings.runExternalValidation:
            try:
                cv = CrossValidation(selected_df, y)
                cv_nlv = int(np.argmax(cv.Q2()) + 1)
                if validation_settings.runCrossValidation:
                    params = cv.returnParameters(cv_nlv)
                    result.cv = CVResult(
                        q2=float(params.loc["Q2"].iloc[0]),
                        rmse=float(params.loc["RMSECV"].iloc[0]),
                    )
            except np.linalg.LinAlgError:
                cv = None
                cv_nlv = None

        if validation_settings.runYRandomization and cv_nlv is not None:
            try:
                yr = run_yrandomization(selected_df, y, validation_settings.yrandCutoff)
                result.yr = YRResult(score=float(yr["score"]), passed=bool(yr["passed"]))
            except np.linalg.LinAlgError:
                pass

        if validation_settings.runLNO and cv_nlv is not None:
            try:
                lno = run_leavenout(selected_df, y, validation_settings.lnoCutoff)
                result.lno = LNOResult(score=float(lno["score"]), passed=bool(lno["passed"]))
            except np.linalg.LinAlgError:
                pass

        if validation_settings.runExternalValidation and cv_nlv is not None:
            try:
                test_size = max(1, int(round(len(y) * validation_settings.testSetRatio)))
                train, test = kennard_stone_algorithm(selected_df, len(y) - test_size)
                ext = ExternalValidation(selected_df.values, y, cv_nlv)
                ext_df = ext.extVal(train, test, cv_nlv)
                result.ext = EXTResult(
                    r2Pred=float(ext_df.loc["Q2F2"].iloc[0]),
                    rmsep=float(ext_df.loc["RMSEP"].iloc[0]),
                )
            except np.linalg.LinAlgError:
                pass

        return result
    except np.linalg.LinAlgError as exc:
        raise HTTPException(
            status_code=400,
            detail="Validation failed because the selected matrix is singular. Try a different dataset or looser filters.",
        ) from exc


@app.post("/sessions/{session_id}/pipeline")
def run_pipeline(session_id: str, payload: PipelineRequest) -> dict:
    session = _require_session(session_id)
    filters = run_filters(session_id, payload.filterSettings)
    selection = run_selection(
        session_id,
        SelectionRequest(
            filterSettings=payload.filterSettings,
            selectionSettings=payload.selectionSettings,
        ),
    )
    validation = run_validations(
        session_id,
        ValidationRequest(validationSettings=payload.validationSettings),
    )
    return {
        "dataset": filters,
        "selection": selection,
        "validation": validation,
    }

if __name__ == '__main__':
    multiprocessing.freeze_support()  # For Windows support
    run(app, host="127.0.0.1", port=27051, reload=False, workers=1)
