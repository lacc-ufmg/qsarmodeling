import { useCallback, useReducer } from "react";
import {
  type DatasetProfile,
  type FilterSettings,
  type SelectionResult,
  type SelectionSettings,
  type ValidationResult,
  type ValidationSettings,
  loadDataset,
  runFilters,
  runPipeline,
  runSelection,
  runValidations,
} from "../lib/mockQsarBackend";

export type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

type WorkflowState = {
  matrixFile: File | null;
  vectorFile: File | null;
  uploadedDataset: DatasetProfile | null;
  activeDataset: DatasetProfile | null;
  selectionResult: SelectionResult | null;
  validationResult: ValidationResult | null;
  busyState: BusyState;
  error: string | null;
  history: string[];
  filterSettings: FilterSettings;
  selectionSettings: SelectionSettings;
  validationSettings: ValidationSettings;
};

type WorkflowAction =
  | { type: "set-matrix-file"; file: File | null }
  | { type: "set-vector-file"; file: File | null }
  | { type: "set-uploaded-dataset"; dataset: DatasetProfile | null }
  | { type: "set-active-dataset"; dataset: DatasetProfile | null }
  | { type: "set-selection-result"; result: SelectionResult | null }
  | { type: "set-validation-result"; result: ValidationResult | null }
  | { type: "set-busy"; busyState: BusyState }
  | { type: "set-error"; error: string | null }
  | { type: "append-history"; message: string }
  | { type: "update-filter-settings"; patch: Partial<FilterSettings> }
  | { type: "update-selection-settings"; patch: Partial<SelectionSettings> }
  | { type: "update-validation-settings"; patch: Partial<ValidationSettings> };

const initialState: WorkflowState = {
  matrixFile: null,
  vectorFile: null,
  uploadedDataset: null,
  activeDataset: null,
  selectionResult: null,
  validationResult: null,
  busyState: "idle",
  error: null,
  history: [],
  filterSettings: {
    varCut: 0.3,
    corrCut: 0.25,
    autocorrCut: 0.85,
    autoscale: true,
    ljTransform: false,
  },
  selectionSettings: {
    method: "ops",
    latentVarsModel: 10,
    latentVarsOps: 5,
    varsPercentage: 10,
    minVarsModel: 3,
    maxVarsModel: 20,
    populationSize: 50,
    generations: 100,
  },
  validationSettings: {
    runCrossValidation: true,
    runYRandomization: true,
    runLNO: true,
    runExternalValidation: true,
    yrandCutoff: 0.3,
    lnoCutoff: 0.1,
    testSetRatio: 0.2,
  },
};

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "set-matrix-file":
      return { ...state, matrixFile: action.file };
    case "set-vector-file":
      return { ...state, vectorFile: action.file };
    case "set-uploaded-dataset":
      return { ...state, uploadedDataset: action.dataset };
    case "set-active-dataset":
      return { ...state, activeDataset: action.dataset };
    case "set-selection-result":
      return { ...state, selectionResult: action.result };
    case "set-validation-result":
      return { ...state, validationResult: action.result };
    case "set-busy":
      return { ...state, busyState: action.busyState };
    case "set-error":
      return { ...state, error: action.error };
    case "append-history":
      return { ...state, history: [action.message, ...state.history].slice(0, 8) };
    case "update-filter-settings":
      return {
        ...state,
        filterSettings: { ...state.filterSettings, ...action.patch },
      };
    case "update-selection-settings":
      return {
        ...state,
        selectionSettings: { ...state.selectionSettings, ...action.patch },
      };
    case "update-validation-settings":
      return {
        ...state,
        validationSettings: { ...state.validationSettings, ...action.patch },
      };
    default:
      return state;
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useQsarWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, initialState);

  const setMatrixFile = useCallback((file: File | null) => {
    dispatch({ type: "set-matrix-file", file });
  }, []);

  const setVectorFile = useCallback((file: File | null) => {
    dispatch({ type: "set-vector-file", file });
  }, []);

  const updateFilterSettings = useCallback((patch: Partial<FilterSettings>) => {
    dispatch({ type: "update-filter-settings", patch });
  }, []);

  const updateSelectionSettings = useCallback((patch: Partial<SelectionSettings>) => {
    dispatch({ type: "update-selection-settings", patch });
  }, []);

  const updateValidationSettings = useCallback((patch: Partial<ValidationSettings>) => {
    dispatch({ type: "update-validation-settings", patch });
  }, []);

  const setBusyState = useCallback((busyState: BusyState) => {
    dispatch({ type: "set-busy", busyState });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "set-error", error });
  }, []);

  const appendHistory = useCallback((message: string) => {
    dispatch({
      type: "append-history",
      message: `${new Date().toLocaleTimeString()} - ${message}`,
    });
  }, []);

  const loadData = useCallback(async () => {
    const { matrixFile, vectorFile } = state;

    if (!matrixFile || !vectorFile) {
      setError("Select both X matrix and y vector files before loading.");
      return;
    }

    setError(null);
    setBusyState("loading-data");

    try {
      const loaded = await loadDataset(matrixFile, vectorFile);
      dispatch({ type: "set-uploaded-dataset", dataset: loaded });
      dispatch({ type: "set-active-dataset", dataset: loaded });
      dispatch({ type: "set-selection-result", result: null });
      dispatch({ type: "set-validation-result", result: null });
      appendHistory(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Failed to load dataset."));
    } finally {
      setBusyState("idle");
    }
  }, [appendHistory, setBusyState, setError, state, state.matrixFile, state.vectorFile]);

  const runDescriptorFilters = useCallback(async () => {
    if (!state.uploadedDataset) {
      return;
    }

    setError(null);
    setBusyState("filtering");

    try {
      const filtered = await runFilters(state.uploadedDataset.sessionId, state.filterSettings);
      dispatch({ type: "set-active-dataset", dataset: filtered });
      dispatch({ type: "set-selection-result", result: null });
      dispatch({ type: "set-validation-result", result: null });
      appendHistory(
        `Applied descriptor filters. Active matrix now has ${filtered.descriptors} descriptors.`,
      );
    } catch (filterError) {
      setError(toErrorMessage(filterError, "Failed to run descriptor filters."));
    } finally {
      setBusyState("idle");
    }
  }, [appendHistory, setBusyState, setError, state.filterSettings, state.uploadedDataset]);

  const runVariableSelection = useCallback(async () => {
    if (!state.uploadedDataset) {
      return;
    }

    setError(null);
    setBusyState("selecting");

    try {
      const selected = await runSelection(
        state.uploadedDataset.sessionId,
        state.filterSettings,
        state.selectionSettings,
      );
      dispatch({ type: "set-selection-result", result: selected });
      dispatch({ type: "set-validation-result", result: null });
      appendHistory(
        `${selected.method.toUpperCase()} selected ${selected.selectedDescriptors} descriptors (Q2 ${selected.q2.toFixed(
          3,
        )}).`,
      );
    } catch (selectionError) {
      setError(toErrorMessage(selectionError, "Failed to run variable selection."));
    } finally {
      setBusyState("idle");
    }
  }, [appendHistory, setBusyState, setError, state.filterSettings, state.selectionSettings, state.uploadedDataset]);

  const runValidationSuite = useCallback(async () => {
    if (!state.uploadedDataset) {
      return;
    }

    setError(null);
    setBusyState("validating");

    try {
      const results = await runValidations(state.uploadedDataset.sessionId, state.validationSettings);
      dispatch({ type: "set-validation-result", result: results });
      appendHistory("Validation suite completed.");
    } catch (validationError) {
      setError(toErrorMessage(validationError, "Failed to run validations."));
    } finally {
      setBusyState("idle");
    }
  }, [appendHistory, setBusyState, setError, state.uploadedDataset, state.validationSettings]);

  const runFullPipeline = useCallback(async () => {
    const { matrixFile, vectorFile } = state;

    if (!matrixFile || !vectorFile) {
      setError("Select both X matrix and y vector files before running the full pipeline.");
      return;
    }

    setError(null);
    setBusyState("loading-data");

    try {
      const loaded = await loadDataset(matrixFile, vectorFile);
      dispatch({ type: "set-uploaded-dataset", dataset: loaded });
      dispatch({ type: "set-selection-result", result: null });
      dispatch({ type: "set-validation-result", result: null });
      appendHistory(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);

      setBusyState("filtering");
      const pipeline = await runPipeline(
        loaded.sessionId,
        state.filterSettings,
        state.selectionSettings,
        state.validationSettings,
      );
      dispatch({ type: "set-active-dataset", dataset: pipeline.dataset });
      dispatch({ type: "set-selection-result", result: pipeline.selection });
      dispatch({ type: "set-validation-result", result: pipeline.validation });
      appendHistory(
        `Applied descriptor filters. Active matrix now has ${pipeline.dataset.descriptors} descriptors.`,
      );
      appendHistory(
        `${pipeline.selection.method.toUpperCase()} selected ${pipeline.selection.selectedDescriptors} descriptors (Q2 ${pipeline.selection.q2.toFixed(
          3,
        )}).`,
      );
      appendHistory("Validation suite completed.");
      appendHistory("Full pipeline finished with backend results.");
    } catch (pipelineError) {
      setError(toErrorMessage(pipelineError, "Failed to run the full pipeline."));
    } finally {
      setBusyState("idle");
    }
  }, [appendHistory, setBusyState, setError, state]);

  const isIdle = state.busyState === "idle";
  const canLoadData = Boolean(state.matrixFile && state.vectorFile) && isIdle;
  const canRunFilters = Boolean(state.activeDataset) && isIdle;
  const canRunSelection = Boolean(state.activeDataset) && isIdle;
  const canRunValidation = Boolean(state.selectionResult) && isIdle;
  const canRunPipeline = Boolean(state.matrixFile && state.vectorFile) && isIdle;

  return {
    state,
    actions: {
      setMatrixFile,
      setVectorFile,
      updateFilterSettings,
      updateSelectionSettings,
      updateValidationSettings,
      loadData,
      runDescriptorFilters,
      runVariableSelection,
      runValidationSuite,
      runFullPipeline,
    },
    selectors: {
      canLoadData,
      canRunFilters,
      canRunSelection,
      canRunValidation,
      canRunPipeline,
      isIdle,
    },
  };
}
