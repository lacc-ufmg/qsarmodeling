import { useCallback, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { DatasetMetadata, FilterConfig, OpsResult, OpsConfig } from "../generated";
import { applyFilterCmd, loadDatasetCmd, runSelectionCmd } from "../generated";

type WorkflowState = {
  matrixFilePath: string | null;
  vectorFilePath: string | null;
  uploadedDataset: DatasetMetadata | null;
  activeDataset: DatasetMetadata | null;
  isFiltered: boolean;
  selectionResult: OpsResult | null;
  busyState: "idle" | "loading-data" | "filtering" | "selecting";
  error: string | null;
  filterSettings: FilterConfig;
  selectionSettings: OpsConfig;
};

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useQsarWorkflow() {
  const [matrixFilePath, setMatrixFilePath] = useState<string | null>(null);
  const [vectorFilePath, setVectorFilePath] = useState<string | null>(null);

  const [uploadedDataset, setUploadedDataset] = useState<DatasetMetadata | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetMetadata | null>(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const [selectionResult, setSelectionResult] = useState<OpsResult | null>(null);

  const [busyState, setBusyState] = useState<WorkflowState["busyState"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const [filterSettings, setFilterSettings] = useState<FilterConfig>({
    varianceCut: 0.3,
    correlationCut: 0.25,
    autocorrelationCut: 0.85,
    autoscale: true,
  });

  const [selectionSettings, setSelectionSettings] = useState<OpsConfig>({
    latentVarsOps: 3,
    latentVarsModel: 3,
    varsPercentage: 0.5,
    minVarsModel: 2,
  });

  const updateFilterSettings = useCallback((patch: Partial<FilterConfig>) => {
    setFilterSettings((s) => ({ ...s, ...patch }));
  }, []);

  const updateSelectionSettings = useCallback((patch: Partial<OpsConfig>) => {
    setSelectionSettings((s) => ({ ...s, ...patch }));
  }, []);

  const selectMatrixFile = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (selected && typeof selected === "string") setMatrixFilePath(selected);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to select matrix file."));
    }
  }, []);

  const selectVectorFile = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (selected && typeof selected === "string") setVectorFilePath(selected);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to select vector file."));
    }
  }, []);

  const clearMatrixFile = useCallback(() => setMatrixFilePath(null), []);
  const clearVectorFile = useCallback(() => setVectorFilePath(null), []);

  const loadData = useCallback(async () => {
    if (!matrixFilePath || !vectorFilePath) {
      setError("Select both X matrix and y vector files before loading.");
      return;
    }

    try {
      setBusyState("loading-data");
      const meta = await loadDatasetCmd({ xPath: matrixFilePath, yPath: vectorFilePath });

      setUploadedDataset(meta);
      setActiveDataset(meta);
      setIsFiltered(false);
      setSelectionResult(null);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load dataset."));
    } finally {
      setBusyState("idle");
    }
  }, [matrixFilePath, vectorFilePath]);

  const runDescriptorFilters = useCallback(async () => {
    if (!uploadedDataset) return;

    try {
      setBusyState("filtering");

      const result = await applyFilterCmd({ config: filterSettings });
      const descriptors = result.state.kept.length;

      const newActive: DatasetMetadata = {
        ...uploadedDataset,
        n_features: descriptors,
      };

      setActiveDataset(newActive);
      setIsFiltered(true);
      setSelectionResult(null);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to run descriptor filters."));
    } finally {
      setBusyState("idle");
    }
  }, [uploadedDataset, filterSettings]);

  const runVariableSelection = useCallback(async () => {
    if (!activeDataset) return;

    try {
      setBusyState("selecting");
      const result = await runSelectionCmd({ settings: selectionSettings });
      setSelectionResult(result);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to run variable selection."));
    } finally {
      setBusyState("idle");
    }
  }, [activeDataset, selectionSettings]);

  const isIdle = busyState === "idle";
  const canLoadData = Boolean(matrixFilePath && vectorFilePath) && isIdle;
  const canRunFilters = Boolean(activeDataset) && isIdle;
  const canRunSelection = Boolean(activeDataset) && isIdle;
  const canRunPipeline = false;

  const state = useMemo<WorkflowState>(
    () => ({
      matrixFilePath,
      vectorFilePath,
      uploadedDataset,
      activeDataset,
      isFiltered,
      selectionResult,
      busyState,
      error,
      filterSettings,
      selectionSettings,
    }),
    [
      activeDataset,
      busyState,
      error,
      filterSettings,
      isFiltered,
      matrixFilePath,
      selectionResult,
      selectionSettings,
      uploadedDataset,
      vectorFilePath,
    ],
  );

  return {
    state,
    actions: {
      selectMatrixFile,
      selectVectorFile,
      clearMatrixFile,
      clearVectorFile,
      updateFilterSettings,
      updateSelectionSettings,
      loadData,
      runDescriptorFilters,
      runVariableSelection,
    },
    selectors: {
      canLoadData,
      canRunFilters,
      canRunSelection,
      canRunPipeline,
      isIdle,
    },
  };
}
