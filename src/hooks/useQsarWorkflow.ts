import { useCallback, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { DatasetMetadata, FilterConfig } from "../generated";
import { applyFilterCmd, loadDatasetCmd } from "../generated";

type WorkflowState = {
  matrixFilePath: string | null;
  vectorFilePath: string | null;
  uploadedDataset: DatasetMetadata | null;
  activeDataset: DatasetMetadata | null;
  isFiltered: boolean;
  busyState: "idle" | "loading-data" | "filtering";
  error: string | null;
  filterSettings: FilterConfig;
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

  const [busyState, setBusyState] = useState<WorkflowState["busyState"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const [filterSettings, setFilterSettings] = useState<FilterConfig>({
    varianceCut: 0.3,
    correlationCut: 0.25,
    autocorrelationCut: 0.85,
    autoscale: true,
    ljTransform: false,
  });

  const updateFilterSettings = useCallback((patch: Partial<FilterConfig>) => {
    setFilterSettings((s) => ({ ...s, ...patch }));
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
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to run descriptor filters."));
    } finally {
      setBusyState("idle");
    }
  }, [uploadedDataset, filterSettings]);

  const isIdle = busyState === "idle";
  const canLoadData = Boolean(matrixFilePath && vectorFilePath) && isIdle;
  const canRunFilters = Boolean(activeDataset) && isIdle;
  const canRunPipeline = false;

  const state = useMemo<WorkflowState>(
    () => ({
      matrixFilePath,
      vectorFilePath,
      uploadedDataset,
      activeDataset,
      isFiltered,
      busyState,
      error,
      filterSettings,
    }),
    [activeDataset, busyState, error, filterSettings, isFiltered, matrixFilePath, uploadedDataset, vectorFilePath],
  );

  return {
    state,
    actions: {
      selectMatrixFile,
      selectVectorFile,
      clearMatrixFile,
      clearVectorFile,
      updateFilterSettings,
      loadData,
      runDescriptorFilters,
    },
    selectors: {
      canLoadData,
      canRunFilters,
      canRunPipeline,
      isIdle,
    },
  };
}
