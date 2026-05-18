"use client";

import { useMemo, useState } from "react";
import {
  type DatasetProfile,
  type FilterSettings,
  type SelectionResult,
  type SelectionSettings,
  type ValidationResult,
  type ValidationSettings,
  loadDataset,
  runFilters,
  runSelection,
  runValidations,
  runPipeline,
} from "@/lib/mockQsarBackend";

// Tooltip component for parameter help
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      >
        ?
      </button>
      {show && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {text}
          <div className="absolute top-full left-1/2 h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-zinc-900 -translate-x-1/2 dark:border-t-zinc-100" />
        </div>
      )}
    </div>
  );
}

// Expandable section for fine-tune settings
function ExpandableSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-4 border-t pt-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        <svg className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7-7m0 0L5 14" />
        </svg>
        {title}
      </button>
      {expanded && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

// Result card component
function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {title}
      </h3>
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </div>
  );
}

type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

const panelClass =
  "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

export default function Home() {
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [vectorFile, setVectorFile] = useState<File | null>(null);

  const matrixFileName = matrixFile?.name ?? "";
  const vectorFileName = vectorFile?.name ?? "";

  const [uploadedDataset, setUploadedDataset] = useState<DatasetProfile | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetProfile | null>(null);
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [busyState, setBusyState] = useState<BusyState>("idle");
  const [error, setError] = useState("");
  const [timeline, setTimeline] = useState<string[]>([]);

  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    varCut: 0.15,
    corrCut: 0.25,
    autocorrCut: 0.25,
    autoscale: true,
    ljTransform: false,
  });

  const [selectionSettings, setSelectionSettings] = useState<SelectionSettings>({
    method: "ops",
    latentVarsModel: 6,
    latentVarsOps: 4,
    varsPercentage: 15,
    minVarsModel: 8,
    maxVarsModel: 30,
    populationSize: 80,
    generations: 40,
  });

  const [validationSettings, setValidationSettings] = useState<ValidationSettings>({
    runCrossValidation: true,
    runYRandomization: true,
    runLNO: true,
    runExternalValidation: true,
    yrandCutoff: 0.3,
    lnoCutoff: 0.1,
    testSetRatio: 0.2,
  });

  const busyCopy: Record<BusyState, { label: string; description: string }> = {
    idle: {
      label: "Ready",
      description: "Choose the input files, then step through preprocessing, selection, and validation.",
    },
    "loading-data": {
      label: "Loading dataset",
      description: "The app is loading the uploaded CSV files into a backend session.",
    },
    filtering: {
      label: "Applying filters",
      description: "Descriptor cuts and transforms are being applied to the active matrix.",
    },
    selecting: {
      label: "Selecting variables",
      description: "OPS or GA is running against the filtered matrix.",
    },
    validating: {
      label: "Running validations",
      description: "Cross validation and stability checks are being evaluated.",
    },
  };

  const appendTimeline = (message: string): void => {
    setTimeline((current) => [
      `${new Date().toLocaleTimeString()} - ${message}`,
      ...current.slice(0, 7),
    ]);
  };

  const currentBusyCopy = busyCopy[busyState];

  const nextStepMessage = useMemo(() => {
    if (busyState !== "idle") {
      return `Wait for ${currentBusyCopy.label.toLowerCase()} to finish before moving on.`;
    }

    if (!matrixFileName || !vectorFileName) {
      return "Select both CSV files to unlock the dataset loader.";
    }

    if (!uploadedDataset) {
      return "Load the dataset first so preprocessing and selection can use the active matrix.";
    }

    if (!selectionResult) {
      return "Review the preprocessing settings, then run variable selection.";
    }

    if (!validationResult) {
      return "Run the validation suite to confirm model quality and stability.";
    }

    return "Try a different filter or selection configuration to compare outcomes.";
  }, [busyState, currentBusyCopy.label, matrixFileName, uploadedDataset, selectionResult, validationResult, vectorFileName]);

  const canRunFilters = Boolean(activeDataset) && busyState === "idle";
  const canRunSelection = Boolean(activeDataset) && busyState === "idle";
  const canRunValidation = Boolean(selectionResult) && busyState === "idle";
  const canRunPipeline = Boolean(matrixFile && vectorFile) && busyState === "idle";
  const canLoadData = Boolean(matrixFile && vectorFile) && busyState === "idle";

  const stages = useMemo(
    () => [
      {
        label: "Data",
        status: uploadedDataset ? "Loaded" : matrixFileName && vectorFileName ? "Ready to load" : "Waiting for files",
        detail: uploadedDataset
          ? `${uploadedDataset.matrixName} and ${uploadedDataset.vectorName}`
          : "Choose both X and y CSV files first.",
      },
      {
        label: "Preprocessing",
        status:
          activeDataset?.source === "filtered"
            ? "Applied"
            : uploadedDataset
              ? "Ready to run"
              : "Blocked",
        detail:
          activeDataset?.source === "filtered"
            ? `${activeDataset.descriptors} descriptors active`
            : "Tune the descriptor cuts and transforms.",
      },
      {
        label: "Selection",
        status: selectionResult ? "Completed" : activeDataset ? "Ready to run" : "Blocked",
        detail: selectionResult
          ? `${selectionResult.method.toUpperCase()} selected ${selectionResult.selectedDescriptors} descriptors`
          : "Pick OPS or GA after preprocessing.",
      },
      {
        label: "Validation",
        status: validationResult ? "Completed" : selectionResult ? "Ready to run" : "Blocked",
        detail: validationResult
          ? "Validation metrics are available below."
          : "Run the checks you want to inspect.",
      },
    ],
    [activeDataset, matrixFileName, selectionResult, uploadedDataset, validationResult, vectorFileName]
  );

  async function handleLoadData(): Promise<void> {
    if (!matrixFile || !vectorFile) {
      setError("Select both X matrix and y vector files before loading.");
      return;
    }
    setError("");
    setBusyState("loading-data");
    try {
      const loaded = await loadDataset(matrixFile, vectorFile);
      setUploadedDataset(loaded);
      setActiveDataset(loaded);
      setSelectionResult(null);
      setValidationResult(null);
      appendTimeline(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dataset.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunFilters(): Promise<void> {
    if (!uploadedDataset) return;
    setBusyState("filtering");
    try {
      const filtered = await runFilters(uploadedDataset.sessionId, filterSettings);
      setActiveDataset(filtered);
      setSelectionResult(null);
      setValidationResult(null);
      appendTimeline(`Applied descriptor filters. Active matrix now has ${filtered.descriptors} descriptors.`);
    } catch (filterError) {
      setError(filterError instanceof Error ? filterError.message : "Failed to run descriptor filters.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunSelection(): Promise<void> {
    if (!uploadedDataset) return;
    setBusyState("selecting");
    try {
      const selected = await runSelection(uploadedDataset.sessionId, filterSettings, selectionSettings);
      setSelectionResult(selected);
      setValidationResult(null);
      appendTimeline(
        `${selected.method.toUpperCase()} selected ${selected.selectedDescriptors} descriptors (Q² ${selected.q2.toFixed(3)}).`
      );
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to run variable selection.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunValidation(): Promise<void> {
    if (!uploadedDataset) return;
    setBusyState("validating");
    try {
      const results = await runValidations(uploadedDataset.sessionId, validationSettings);
      setValidationResult(results);
      appendTimeline("Validation suite completed.");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Failed to run validations.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunPipeline(): Promise<void> {
    if (!matrixFile || !vectorFile) {
      setError("Select both X matrix and y vector files before running the full pipeline.");
      return;
    }

    setError("");
    setBusyState("loading-data");
    try {
      const loaded = await loadDataset(matrixFile, vectorFile);
      setUploadedDataset(loaded);
      setSelectionResult(null);
      setValidationResult(null);
      appendTimeline(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);

      setBusyState("filtering");
      const pipeline = await runPipeline(
        loaded.sessionId,
        filterSettings,
        selectionSettings,
        validationSettings
      );
      setActiveDataset(pipeline.dataset);
      setSelectionResult(pipeline.selection);
      setValidationResult(pipeline.validation);
      appendTimeline(`Applied descriptor filters. Active matrix now has ${pipeline.dataset.descriptors} descriptors.`);
      appendTimeline(
        `${pipeline.selection.method.toUpperCase()} selected ${pipeline.selection.selectedDescriptors} descriptors (Q² ${pipeline.selection.q2.toFixed(3)}).`
      );
      appendTimeline("Validation suite completed.");
      appendTimeline("Full pipeline finished with backend results.");
    } catch (pipelineError) {
      setError(pipelineError instanceof Error ? pipelineError.message : "Failed to run the full pipeline.");
    } finally {
      setBusyState("idle");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-zinc-900 dark:text-zinc-100 sm:px-8">
      <header className="mb-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-400">
            Guided workflow
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            QSAR Model Builder
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            A guided workflow for QSAR model development. Follow the steps in order, and we'll help you at each stage with sensible defaults and detailed explanations.
          </p>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {busyState !== "idle" ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 flex items-center gap-3">
          <svg className="h-5 w-5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="31.4 31.4" />
          </svg>
          <div>
            <p className="font-medium">{currentBusyCopy.label}</p>
            <p className="text-xs">{currentBusyCopy.description}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-8 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">Current status</p>
            <p className="mt-1 text-base font-semibold text-indigo-700 dark:text-indigo-300">{currentBusyCopy.label}</p>
          </div>
          <div className="rounded-lg bg-indigo-100 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {nextStepMessage}
          </div>
        </div>
      </div>

      <main className="space-y-6">

        {/* Step 1: Load Data */}
        <section className={panelClass}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">1</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Load your data</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Upload CSV files for the descriptor matrix (X) and target variable (y)</p>
              </div>
            </div>
            {uploadedDataset ? (
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </div>

          {uploadedDataset ? null : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-2 block font-medium">X matrix (.csv)</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    onChange={(event) =>
                      setMatrixFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">
                    {matrixFileName || "No file selected"}
                  </span>
                </label>
                <label className="text-sm">
                  <span className="mb-2 block font-medium">y vector (.csv)</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    onChange={(event) =>
                      setVectorFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">
                    {vectorFileName || "No file selected"}
                  </span>
                </label>
              </div>
              <button
                type="button"
                disabled={!canLoadData}
                className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-700"
                onClick={handleLoadData}
              >
                {busyState === "loading-data" ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="31.4 31.4" />
                    </svg>
                    Loading dataset...
                  </>
                ) : (
                  "Load dataset"
                )}
              </button>
            </>
          )}

          {uploadedDataset ? (
            <ResultCard title="Dataset loaded successfully">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Rows:</span>
                  <p className="font-semibold">{uploadedDataset.rows}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Descriptors:</span>
                  <p className="font-semibold">{uploadedDataset.descriptors}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Files:</span>
                  <p className="text-xs font-semibold">{uploadedDataset.matrixName}, {uploadedDataset.vectorName}</p>
                </div>
              </div>
            </ResultCard>
          ) : null}
        </section>

        {/* Step 2: Preprocessing */}
        <section className={`${panelClass} ${!uploadedDataset ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">2</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Filter descriptors</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Remove noisy variables before model selection</p>
              </div>
            </div>
            {activeDataset?.source === "filtered" ? (
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </div>

          {uploadedDataset ? (
            <>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/30">
                <p className="text-sm font-medium mb-3">Basic settings (recommended for most datasets)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberFieldWithTooltip
                    label="Variance cut"
                    help="Removes descriptors with low variance across samples. Higher values filter more aggressively."
                    value={filterSettings.varCut}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) =>
                      setFilterSettings((prev) => ({ ...prev, varCut: value }))
                    }
                  />
                  <NumberFieldWithTooltip
                    label="Correlation cut"
                    help="Removes highly correlated descriptors to reduce multicollinearity. Higher values filter more aggressively."
                    value={filterSettings.corrCut}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) =>
                      setFilterSettings((prev) => ({ ...prev, corrCut: value }))
                    }
                  />
                  <NumberFieldWithTooltip
                    label="Autocorrelation cut"
                    help="Removes descriptors with high autocorrelation within themselves. Lower values filter more aggressively."
                    value={filterSettings.autocorrCut}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) =>
                      setFilterSettings((prev) => ({ ...prev, autocorrCut: value }))
                    }
                  />
                </div>
              </div>

              <ExpandableSection title="Fine-tune settings">
                <div className="space-y-3">
                  <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                    <input
                      type="checkbox"
                      checked={filterSettings.autoscale}
                      onChange={(event) =>
                        setFilterSettings((prev) => ({ ...prev, autoscale: event.target.checked }))
                      }
                    />
                    <span>
                      <span className="font-medium">Autoscale</span>
                      <span className="text-zinc-500 dark:text-zinc-400 ml-1">(mean-center and scale to unit variance)</span>
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                    <input
                      type="checkbox"
                      checked={filterSettings.ljTransform}
                      onChange={(event) =>
                        setFilterSettings((prev) => ({ ...prev, ljTransform: event.target.checked }))
                      }
                    />
                    <span>
                      <span className="font-medium">LJ transform</span>
                      <span className="text-zinc-500 dark:text-zinc-400 ml-1">(apply Lennard-Jones descriptor transformation)</span>
                    </span>
                  </label>
                </div>
              </ExpandableSection>

              <button
                type="button"
                disabled={!canRunFilters}
                className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
                onClick={handleRunFilters}
              >
                {busyState === "filtering" ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="31.4 31.4" />
                    </svg>
                    Applying filters...
                  </>
                ) : (
                  "Apply filters"
                )}
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Load a dataset first to enable filtering.</p>
          )}

          {activeDataset?.source === "filtered" ? (
            <ResultCard title="Filters applied successfully">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Active descriptors:</span>
                  <p className="font-semibold">{activeDataset.descriptors}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Removed:</span>
                  <p className="font-semibold">{uploadedDataset ? uploadedDataset.descriptors - activeDataset.descriptors : 0}</p>
                </div>
              </div>
            </ResultCard>
          ) : null}
        </section>

        {/* Step 3: Selection */}
        <section className={`${panelClass} ${!activeDataset ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">3</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Select variables</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Choose the best subset of descriptors for your model</p>
              </div>
            </div>
            {selectionResult ? (
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </div>

          {activeDataset ? (
            <>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/30">
                <p className="text-sm font-medium mb-3">Choose selection method</p>
                <fieldset className="flex gap-4 text-sm">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:border-zinc-800 dark:has-[:checked]:bg-indigo-950/30 dark:has-[:checked]:border-indigo-700">
                    <input
                      type="radio"
                      checked={selectionSettings.method === "ops"}
                      onChange={() => setSelectionSettings((prev) => ({ ...prev, method: "ops" }))}
                    />
                    <span>
                      <span className="font-medium">OPS</span>
                      <span className="text-zinc-500 dark:text-zinc-400 ml-1 text-xs">(Orthogonal Projections to Latent Structures)</span>
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:border-zinc-800 dark:has-[:checked]:bg-indigo-950/30 dark:has-[:checked]:border-indigo-700">
                    <input
                      type="radio"
                      name="method"
                      checked={selectionSettings.method === "ga"}
                      onChange={() => setSelectionSettings((prev) => ({ ...prev, method: "ga" }))}
                    />
                    <span>
                      <span className="font-medium">GA</span>
                      <span className="text-zinc-500 dark:text-zinc-400 ml-1 text-xs">(Genetic Algorithm)</span>
                    </span>
                  </label>
                </fieldset>
              </div>

              <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/30">
                <p className="text-sm font-medium mb-3">Basic settings</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberFieldWithTooltip
                    label="Latent variables (model)"
                    help="Number of latent variables (PLS components) in the final model. Higher values provide better quality with longer calculations."
                    value={selectionSettings.latentVarsModel}
                    min={1}
                    max={30}
                    step={1}
                    onChange={(value) =>
                      setSelectionSettings((prev) => ({ ...prev, latentVarsModel: value }))
                    }
                  />
                  {selectionSettings.method === "ops" ? (
                    <NumberFieldWithTooltip
                      label="Latent variables (OPS)"
                      help="Number of latent variables used during OPS selection process. Higher values increase computational cost but may improve robustness."
                      value={selectionSettings.latentVarsOps}
                      min={1}
                      max={20}
                      step={1}
                      onChange={(value) =>
                        setSelectionSettings((prev) => ({ ...prev, latentVarsOps: value }))
                      }
                    />
                  ) : null}
                </div>
              </div>

              <ExpandableSection title={`${selectionSettings.method === "ops" ? "OPS" : "GA"} fine-tuning`}>
                <div className="space-y-3">
                  {selectionSettings.method === "ops" ? (
                    <>
                      <NumberFieldWithTooltip
                        label="Variables percentage"
                        help="Percentage of descriptors to evaluate during OPS selection. Lower values reduce search space but may miss optimal features."
                        value={selectionSettings.varsPercentage}
                        min={1}
                        max={60}
                        step={1}
                        onChange={(value) =>
                          setSelectionSettings((prev) => ({ ...prev, varsPercentage: value }))
                        }
                      />
                    </>
                  ) : (
                    <>
                      <NumberFieldWithTooltip
                        label="Min vars per model"
                        help="Minimum number of descriptors in any candidate model. Higher values create more complex models but reduce overfitting risk."
                        value={selectionSettings.minVarsModel}
                        min={1}
                        max={50}
                        step={1}
                        onChange={(value) =>
                          setSelectionSettings((prev) => ({ ...prev, minVarsModel: value }))
                        }
                      />
                      <NumberFieldWithTooltip
                        label="Max vars per model"
                        help="Maximum number of descriptors in any candidate model. Lower values favor simpler models; higher values allow more complex solutions."
                        value={selectionSettings.maxVarsModel}
                        min={2}
                        max={200}
                        step={1}
                        onChange={(value) =>
                          setSelectionSettings((prev) => ({ ...prev, maxVarsModel: value }))
                        }
                      />
                      <NumberFieldWithTooltip
                        label="Population size"
                        help="Number of models in each generation of the genetic algorithm. Larger populations explore the search space better but increase computation time."
                        value={selectionSettings.populationSize}
                        min={20}
                        max={300}
                        step={1}
                        onChange={(value) =>
                          setSelectionSettings((prev) => ({ ...prev, populationSize: value }))
                        }
                      />
                      <NumberFieldWithTooltip
                        label="Generations"
                        help="Number of generations to evolve in the genetic algorithm. More generations improve convergence but require longer computation."
                        value={selectionSettings.generations}
                        min={10}
                        max={500}
                        step={1}
                        onChange={(value) =>
                          setSelectionSettings((prev) => ({ ...prev, generations: value }))
                        }
                      />
                    </>
                  )}
                </div>
              </ExpandableSection>

              <button
                type="button"
                disabled={!canRunSelection}
                className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
                onClick={handleRunSelection}
              >
                {busyState === "selecting" ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="31.4 31.4" />
                    </svg>
                    Running selection...
                  </>
                ) : (
                  `Run ${selectionSettings.method.toUpperCase()}`
                )}
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Complete preprocessing first to enable variable selection.</p>
          )}

          {selectionResult ? (
            <ResultCard title="Selection completed">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Method:</span>
                  <p className="font-semibold">{selectionResult.method.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Descriptors:</span>
                  <p className="font-semibold">{selectionResult.selectedDescriptors}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Q²:</span>
                  <p className="font-semibold">{selectionResult.q2.toFixed(3)}</p>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">R²:</span>
                  <p className="font-semibold">{selectionResult.r2.toFixed(3)}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Latent variables:</span>
                  <p className="font-semibold">{selectionResult.latentVariables}</p>
                </div>
              </div>
            </ResultCard>
          ) : null}
        </section>

        {/* Step 4: Validation */}
        <section className={`${panelClass} ${!selectionResult ? "opacity-50" : ""}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">4</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Validate model</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Run validation tests to confirm model quality and stability</p>
              </div>
            </div>
            {validationResult ? (
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </div>

          {selectionResult ? (
            <>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/30">
                <p className="text-sm font-medium mb-3">Choose validation tests</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:border-zinc-800 dark:has-[:checked]:bg-indigo-950/30 dark:has-[:checked]:border-indigo-700">
                    <input
                      type="checkbox"
                      checked={validationSettings.runCrossValidation}
                      onChange={(event) =>
                        setValidationSettings((prev) => ({ ...prev, runCrossValidation: event.target.checked }))
                      }
                    />
                    <span className="font-medium">Cross validation</span>
                  </label>
                  <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:border-zinc-800 dark:has-[:checked]:bg-indigo-950/30 dark:has-[:checked]:border-indigo-700">
                    <input
                      type="checkbox"
                      checked={validationSettings.runYRandomization}
                      onChange={(event) =>
                        setValidationSettings((prev) => ({ ...prev, runYRandomization: event.target.checked }))
                      }
                    />
                    <span className="font-medium">Y-randomization</span>
                  </label>
                  <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:border-zinc-800 dark:has-[:checked]:bg-indigo-950/30 dark:has-[:checked]:border-indigo-700">
                    <input
                      type="checkbox"
                      checked={validationSettings.runLNO}
                      onChange={(event) =>
                        setValidationSettings((prev) => ({ ...prev, runLNO: event.target.checked }))
                      }
                    />
                    <span className="font-medium">Leave-N-Out</span>
                  </label>
                  <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:border-zinc-800 dark:has-[:checked]:bg-indigo-950/30 dark:has-[:checked]:border-indigo-700">
                    <input
                      type="checkbox"
                      checked={validationSettings.runExternalValidation}
                      onChange={(event) =>
                        setValidationSettings((prev) => ({ ...prev, runExternalValidation: event.target.checked }))
                      }
                    />
                    <span className="font-medium">External validation</span>
                  </label>
                </div>
              </div>

              <ExpandableSection title="Fine-tune thresholds">
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberFieldWithTooltip
                    label="Y-rand cutoff"
                    help="Threshold for Y-randomization test. Models above this are likely overfit."
                    value={validationSettings.yrandCutoff}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) =>
                      setValidationSettings((prev) => ({ ...prev, yrandCutoff: value }))
                    }
                  />
                  <NumberFieldWithTooltip
                    label="LNO cutoff"
                    help="Threshold for Leave-N-Out test. Lower values are stricter; higher values accept more variation."
                    value={validationSettings.lnoCutoff}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) =>
                      setValidationSettings((prev) => ({ ...prev, lnoCutoff: value }))
                    }
                  />
                  <NumberFieldWithTooltip
                    label="Test set ratio"
                    help="Fraction of data to use for external validation."
                    value={validationSettings.testSetRatio}
                    min={0.1}
                    max={0.5}
                    step={0.01}
                    onChange={(value) =>
                      setValidationSettings((prev) => ({ ...prev, testSetRatio: value }))
                    }
                  />
                </div>
              </ExpandableSection>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!canRunValidation}
                  className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
                  onClick={handleRunValidation}
                >
                  {busyState === "validating" ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="31.4 31.4" />
                      </svg>
                      Running validation...
                    </>
                  ) : (
                    "Run validation"
                  )}
                </button>
                <button
                  type="button"
                  disabled={!canRunPipeline}
                  className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-700"
                  onClick={handleRunPipeline}
                >
                  {busyState !== "idle" ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="31.4 31.4" />
                      </svg>
                      Running full pipeline...
                    </>
                  ) : (
                    "▶ Run full pipeline"
                  )}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Complete variable selection first to enable validation.</p>
          )}

          {validationResult ? (
            <ResultCard title="Validation completed">
              <div className="space-y-2">
                {validationResult.cv ? (
                  <div className="flex justify-between">
                    <span>Cross validation Q²:</span>
                    <span className="font-semibold">{validationResult.cv.q2.toFixed(3)}</span>
                  </div>
                ) : null}
                {validationResult.yr ? (
                  <div className="flex justify-between">
                    <span>Y-randomization:</span>
                    <span className={`font-semibold ${validationResult.yr.passed ? "text-green-600" : "text-red-600"}`}>
                      {validationResult.yr.score.toFixed(3)} {validationResult.yr.passed ? "✓ PASS" : "✗ FAIL"}
                    </span>
                  </div>
                ) : null}
                {validationResult.lno ? (
                  <div className="flex justify-between">
                    <span>Leave-N-Out:</span>
                    <span className={`font-semibold ${validationResult.lno.passed ? "text-green-600" : "text-red-600"}`}>
                      {validationResult.lno.score.toFixed(3)} {validationResult.lno.passed ? "✓ PASS" : "✗ FAIL"}
                    </span>
                  </div>
                ) : null}
                {validationResult.ext ? (
                  <div className="flex justify-between">
                    <span>External validation R²pred:</span>
                    <span className="font-semibold">{validationResult.ext.r2Pred.toFixed(3)}</span>
                  </div>
                ) : null}
              </div>
            </ResultCard>
          ) : null}
        </section>

        {/* Workflow Timeline */}
        {timeline.length > 0 ? (
          <section className={panelClass}>
            <h2 className="text-lg font-semibold">Workflow history</h2>
            <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 font-mono">
              {timeline.map((item) => (
                <li key={item} className="text-xs">{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

// Helper component with tooltip
function NumberFieldWithTooltip({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium">{label}</span>
        <Tooltip text={help} />
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
