import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type {
  DatasetProfile,
  FilterSettings,
  SelectionResult,
  SelectionSettings,
  ValidationResult,
  ValidationSettings,
} from "../lib/mockQsarBackend";
import {
  getWorkflowSnapshot,
  loadDataset as invokeLoadDataset,
  runFilters as invokeRunFilters,
  runPipeline as invokeRunPipeline,
  runSelection as invokeRunSelection,
  runValidations as invokeRunValidations,
  updateFilterSettings as invokeUpdateFilterSettings,
  updateSelectionSettings as invokeUpdateSelectionSettings,
  updateValidationSettings as invokeUpdateValidationSettings,
  type BusyState,
  type WorkflowSnapshot,
} from "../lib/workflowClient";

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

const initialSnapshot: WorkflowSnapshot = {
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mergeSnapshot(current: WorkflowSnapshot, next: Partial<WorkflowSnapshot>): WorkflowSnapshot {
  return {
    ...current,
    ...next,
    filterSettings: next.filterSettings ? { ...current.filterSettings, ...next.filterSettings } : current.filterSettings,
    selectionSettings: next.selectionSettings
      ? { ...current.selectionSettings, ...next.selectionSettings }
      : current.selectionSettings,
    validationSettings: next.validationSettings
      ? { ...current.validationSettings, ...next.validationSettings }
      : current.validationSettings,
  };
}

export function useQsarWorkflow() {
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [vectorFile, setVectorFile] = useState<File | null>(null);
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(initialSnapshot);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    void (async () => {
      try {
        const currentSnapshot = await getWorkflowSnapshot();
        if (active) {
          setSnapshot(currentSnapshot);
        }

        unlisten = await listen<WorkflowSnapshot>("workflow:state-updated", (event) => {
          setSnapshot((current) => mergeSnapshot(current, event.payload));
        });
      } catch (error) {
        if (active) {
          setSnapshot((current) => ({
            ...current,
            error: toErrorMessage(error, "Failed to load workflow state."),
          }));
        }
      }
    })();

    return () => {
      active = false;
      void unlisten?.();
    };
  }, []);

  const updateFilterSettings = useCallback(async (patch: Partial<FilterSettings>) => {
    try {
      const nextSnapshot = await invokeUpdateFilterSettings(patch);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(error, "Failed to update filter settings."),
      }));
    }
  }, []);

  const updateSelectionSettings = useCallback(async (patch: Partial<SelectionSettings>) => {
    try {
      const nextSnapshot = await invokeUpdateSelectionSettings(patch);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(error, "Failed to update selection settings."),
      }));
    }
  }, []);

  const updateValidationSettings = useCallback(async (patch: Partial<ValidationSettings>) => {
    try {
      const nextSnapshot = await invokeUpdateValidationSettings(patch);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(error, "Failed to update validation settings."),
      }));
    }
  }, []);

  const setMatrixFileAction = useCallback((file: File | null) => {
    setMatrixFile(file);
  }, []);

  const setVectorFileAction = useCallback((file: File | null) => {
    setVectorFile(file);
  }, []);

  const loadData = useCallback(async () => {
    if (!matrixFile || !vectorFile) {
      setSnapshot((current) => ({
        ...current,
        error: "Select both X matrix and y vector files before loading.",
      }));
      return;
    }

    try {
      const loaded = await invokeLoadDataset(matrixFile, vectorFile);
      setSnapshot(loaded);
    } catch (loadError) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(loadError, "Failed to load dataset."),
      }));
    }
  }, [matrixFile, vectorFile]);

  const runDescriptorFilters = useCallback(async () => {
    if (!snapshot.uploadedDataset) {
      return;
    }

    try {
      const nextSnapshot = await invokeRunFilters();
      setSnapshot(nextSnapshot);
    } catch (filterError) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(filterError, "Failed to run descriptor filters."),
      }));
    }
  }, [snapshot.uploadedDataset]);

  const runVariableSelection = useCallback(async () => {
    if (!snapshot.uploadedDataset) {
      return;
    }

    try {
      const nextSnapshot = await invokeRunSelection();
      setSnapshot(nextSnapshot);
    } catch (selectionError) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(selectionError, "Failed to run variable selection."),
      }));
    }
  }, [snapshot.uploadedDataset]);

  const runValidationSuite = useCallback(async () => {
    if (!snapshot.selectionResult) {
      return;
    }

    try {
      const nextSnapshot = await invokeRunValidations();
      setSnapshot(nextSnapshot);
    } catch (validationError) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(validationError, "Failed to run validations."),
      }));
    }
  }, [snapshot.uploadedDataset]);

  const runFullPipeline = useCallback(async () => {
    if (!matrixFile || !vectorFile) {
      setSnapshot((current) => ({
        ...current,
        error: "Select both X matrix and y vector files before running the full pipeline.",
      }));
      return;
    }

    try {
      const loaded = await invokeLoadDataset(matrixFile, vectorFile);
      setSnapshot(loaded);

      const pipeline = await invokeRunPipeline();
      setSnapshot(pipeline);
    } catch (pipelineError) {
      setSnapshot((current) => ({
        ...current,
        error: toErrorMessage(pipelineError, "Failed to run the full pipeline."),
      }));
    }
  }, [matrixFile, vectorFile]);

  const isIdle = snapshot.busyState === "idle";
  const canLoadData = Boolean(matrixFile && vectorFile) && isIdle;
  const canRunFilters = Boolean(snapshot.activeDataset) && isIdle;
  const canRunSelection = Boolean(snapshot.activeDataset) && isIdle;
  const canRunValidation = Boolean(snapshot.selectionResult) && isIdle;
  const canRunPipeline = Boolean(matrixFile && vectorFile) && isIdle;

  const state = useMemo<WorkflowState>(
    () => ({
      matrixFile,
      vectorFile,
      uploadedDataset: snapshot.uploadedDataset,
      activeDataset: snapshot.activeDataset,
      selectionResult: snapshot.selectionResult,
      validationResult: snapshot.validationResult,
      busyState: snapshot.busyState,
      error: snapshot.error,
      history: snapshot.history,
      filterSettings: snapshot.filterSettings,
      selectionSettings: snapshot.selectionSettings,
      validationSettings: snapshot.validationSettings,
    }),
    [matrixFile, snapshot, vectorFile],
  );

  return {
    state,
    actions: {
      setMatrixFile: setMatrixFileAction,
      setVectorFile: setVectorFileAction,
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
