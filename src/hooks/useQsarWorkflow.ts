import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import type {
  DatasetMetadata,
  ExampleDataset,
  FilterConfig,
  GAConfig,
  GAResult,
  OpsConfig,
  OpsResult,
} from "../generated";
import { GA_PROGRESS_EVENT } from "../generated";
import type { GAProgressEvent } from "../generated";
import {
  applyFilterCmd,
  loadDatasetCmd,
  loadExampleDatasetCmd,
  runGaSelectionCmd,
  runSelectionCmd,
} from "../generated";

type SelectionMode = "ops" | "ga";

type SelectionResult = OpsResult | GAResult;

type WorkflowState = {
  matrixFilePath: string | null;
  vectorFilePath: string | null;
  uploadedDataset: DatasetMetadata | null;
  activeDataset: DatasetMetadata | null;
  isFiltered: boolean;
  selectionMode: SelectionMode;
  selectionResult: SelectionResult | null;
  gaProgress: GAProgressEvent | null;
  busyState: "idle" | "loading-data" | "filtering" | "selecting";
  error: string | null;
  filterSettings: FilterConfig;
  opsSelectionSettings: OpsConfig;
  gaSelectionSettings: GAConfig;
};

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const DEFAULT_GA_SETTINGS: GAConfig = {
  populationSize: 100,
  maxGenerations: 300,
  maxStaleGenerations: 50,
  targetFitnessScore: null,
  replacementRate: 0.5,
  elitismRate: 0.02,
  tournamentSize: 4,
  crossoverSelectionRate: 0.7,
  crossoverRate: 0.8,
  mutationProbability: 0.2,
  cvFolds: 5,
  ridgeLambda: 1e-8,
  minFeatures: 1,
  maxFeatures: null,
  sizePenalty: 0.02,
  fitnessPrecision: 1e-6,
  seed: null,
  parFitness: false, // Disabled to prevent threading issues
};

export function useQsarWorkflow() {
  const [matrixFilePath, setMatrixFilePath] = useState<string | null>(null);
  const [vectorFilePath, setVectorFilePath] = useState<string | null>(null);

  const [uploadedDataset, setUploadedDataset] = useState<DatasetMetadata | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetMetadata | null>(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("ops");
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);
  const [gaProgress, setGaProgress] = useState<GAProgressEvent | null>(null);

  const [busyState, setBusyState] = useState<WorkflowState["busyState"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const [filterSettings, setFilterSettings] = useState<FilterConfig>({
    varianceCut: 0.3,
    correlationCut: 0.25,
    autocorrelationCut: 0.85,
    autoscale: true,
  });

  const [opsSelectionSettings, setOpsSelectionSettings] = useState<OpsConfig>({
    latentVarsOps: 3,
    latentVarsModel: 3,
    varsPercentage: 0.5,
    minVarsModel: 2,
  });

  const [gaSelectionSettings, setGaSelectionSettings] = useState<GAConfig>(DEFAULT_GA_SETTINGS);

  const updateFilterSettings = useCallback((patch: Partial<FilterConfig>) => {
    setFilterSettings((s) => ({ ...s, ...patch }));
  }, []);

  const updateSelectionMode = useCallback((mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectionResult(null);
    if (mode !== "ga") {
      setGaProgress(null);
    }
  }, []);

  const updateOpsSelectionSettings = useCallback((patch: Partial<OpsConfig>) => {
    setOpsSelectionSettings((s) => ({ ...s, ...patch }));
  }, []);

  const updateGaSelectionSettings = useCallback((patch: Partial<GAConfig>) => {
    setGaSelectionSettings((s) => ({ ...s, ...patch }));
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
      setGaProgress(null);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load dataset."));
    } finally {
      setBusyState("idle");
    }
  }, [matrixFilePath, vectorFilePath]);

  const loadExampleDataset = useCallback(async (name: ExampleDataset) => {
    try {
      setBusyState("loading-data");

      const meta = await loadExampleDatasetCmd({ dataset: name });

      setUploadedDataset(meta);
      setActiveDataset(meta);
      setIsFiltered(false);
      setSelectionResult(null);
      setGaProgress(null);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load example dataset."));
    } finally {
      setBusyState("idle");
    }
  }, []);

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
      setGaProgress(null);
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
      if (selectionMode === "ga") {
        setGaProgress({
          phase: "start",
          currentGeneration: 0,
          maxGenerations: gaSelectionSettings.maxGenerations,
          staleGenerations: 0,
          bestGeneration: null,
          progress: 0,
        });
      } else {
        setGaProgress(null);
      }
      console.log(`Starting ${selectionMode === "ga" ? "GA" : "OPS"} selection...`, {
        selectionMode,
        gaSelectionSettings: selectionMode === "ga" ? gaSelectionSettings : undefined,
        opsSelectionSettings: selectionMode === "ops" ? opsSelectionSettings : undefined,
      });

      // Create a promise that times out after 5 minutes for GA or 2 minutes for OPS
      const timeoutMs = selectionMode === "ga" ? 300000 : 120000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`${selectionMode === "ga" ? "GA" : "OPS"} selection timed out after ${timeoutMs / 1000}s`)),
          timeoutMs
        );
      });

      const result = await Promise.race([
        selectionMode === "ga"
          ? runGaSelectionCmd({ settings: gaSelectionSettings })
          : runSelectionCmd({ settings: opsSelectionSettings }),
        timeoutPromise,
      ]);

      console.log(`${selectionMode === "ga" ? "GA" : "OPS"} selection completed:`, result);
      setSelectionResult(result);
      setError(null);
    } catch (err) {
      const errorMsg = toErrorMessage(err, "Failed to run variable selection.");
      console.error("Selection error:", err, errorMsg);
      setError(errorMsg);
    } finally {
      setBusyState("idle");
    }
  }, [activeDataset, gaSelectionSettings, opsSelectionSettings, selectionMode]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<GAProgressEvent>(GA_PROGRESS_EVENT, (event) => {
      setGaProgress(event.payload);
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch((err) => {
        console.error("Failed to subscribe to GA progress events:", err);
      });

    return () => {
      unlisten?.();
    };
  }, []);

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
      selectionMode,
      selectionResult,
      gaProgress,
      busyState,
      error,
      filterSettings,
      opsSelectionSettings,
      gaSelectionSettings,
    }),
    [
      activeDataset,
      busyState,
      error,
      filterSettings,
      gaSelectionSettings,
      isFiltered,
      matrixFilePath,
      opsSelectionSettings,
      selectionMode,
      selectionResult,
      gaProgress,
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
      updateSelectionMode,
      updateOpsSelectionSettings,
      updateGaSelectionSettings,
      loadData,
      loadExampleDataset,
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
