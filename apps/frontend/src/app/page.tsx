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

type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

const panelClass =
  "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

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
    <div className="mx-auto w-full max-w-7xl px-4 py-8 text-zinc-900 dark:text-zinc-100 sm:px-8">
      <header className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] lg:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-400">
            Guided workflow
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            QSAR Model Builder
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Follow the steps in order: choose the matrix files, load the dataset, tune preprocessing,
            run OPS or GA, and finish with validation. The UI keeps the current state visible so you
            always know what is happening and what to do next.
          </p>
        </div>

        <aside className="rounded-3xl border border-zinc-200 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
            Current status
          </p>
          <p className="mt-2 text-lg font-semibold">{currentBusyCopy.label}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{currentBusyCopy.description}</p>
          <p className="mt-3 rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Next: {nextStepMessage}
          </p>
        </aside>
      </header>

      <section className="mb-5 rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-amber-50 p-4 shadow-sm dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-zinc-950 dark:to-amber-950/20">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">How to use this screen</p>
            <ol className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              <li>1. Pick both CSV files so the loader can create a backend session.</li>
              <li>2. Run preprocessing if you want to see how descriptor cuts change the matrix.</li>
              <li>3. Choose OPS or GA, then run validation to inspect the final metrics.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-indigo-200/80 bg-white/80 p-3 text-sm text-zinc-700 shadow-sm dark:border-indigo-900/60 dark:bg-zinc-950/70 dark:text-zinc-300">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">What changes as you progress</p>
            <p className="mt-1">Each step unlocks the next, and the timeline records every action so you can compare runs later.</p>
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className={`${panelClass} py-4`}>
          <p className="text-sm font-medium">Pipeline steps</p>
          <div className="mt-3 space-y-3">
            {stages.map((stage) => {
              const isRunning =
                (stage.label === "Data" && busyState === "loading-data") ||
                (stage.label === "Preprocessing" && busyState === "filtering") ||
                (stage.label === "Selection" && busyState === "selecting") ||
                (stage.label === "Validation" && busyState === "validating");

              // status badge mapping to visual state
              const visual = (() => {
                if (isRunning) return "running";
                if (stage.label === "Data") return uploadedDataset ? "done" : matrixFileName && vectorFileName ? "ready" : "waiting";
                if (stage.label === "Preprocessing") return activeDataset?.source === "filtered" ? "done" : uploadedDataset ? "ready" : "blocked";
                if (stage.label === "Selection") return selectionResult ? "done" : activeDataset ? "ready" : "blocked";
                if (stage.label === "Validation") return validationResult ? "done" : selectionResult ? "ready" : "blocked";
                return "waiting";
              })();

              const icon = (
                <span className="inline-flex h-6 w-6 items-center justify-center">
                  {visual === "done" ? (
                    <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : visual === "blocked" || visual === "waiting" ? (
                    <svg className="h-5 w-5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="9" strokeWidth="2" />
                    </svg>
                  ) : visual === "ready" ? (
                    <svg className="h-5 w-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 animate-spin text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  )}
                </span>
              );

              const disabled = busyState !== "idle" && !isRunning;

              return (
                <div key={stage.label} className="flex items-start justify-between gap-3 rounded-md border border-zinc-100 p-3 dark:border-zinc-800">
                  <div className="flex items-start gap-3">
                    {icon}
                    <div>
                      <p className="font-medium">{stage.label}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{stage.detail}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {stage.label === "Data" ? (
                      <button
                        type="button"
                        disabled={!canLoadData}
                        className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 flex items-center gap-2"
                        onClick={handleLoadData}
                      >
                        {isRunning ? <svg className="h-4 w-4 animate-spin text-amber-50" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" strokeDasharray="31.4 31.4" fill="none" /></svg> : null}
                        {isRunning ? "Loading" : "Load dataset"}
                      </button>
                    ) : stage.label === "Preprocessing" ? (
                      <button
                        type="button"
                        disabled={!canRunFilters}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed dark:border-zinc-700"
                        onClick={handleRunFilters}
                      >
                        {isRunning ? <svg className="h-4 w-4 animate-spin text-amber-600" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" strokeDasharray="31.4 31.4" fill="none" /></svg> : null}
                        {isRunning ? "Filtering" : "Apply filters"}
                      </button>
                    ) : stage.label === "Selection" ? (
                      <button
                        type="button"
                        disabled={!canRunSelection}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed dark:border-zinc-700"
                        onClick={handleRunSelection}
                      >
                        {isRunning ? <svg className="h-4 w-4 animate-spin text-amber-600" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" strokeDasharray="31.4 31.4" fill="none" /></svg> : null}
                        {isRunning ? "Selecting" : "Run selection"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canRunValidation}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed dark:border-zinc-700"
                        onClick={handleRunValidation}
                      >
                        {isRunning ? <svg className="h-4 w-4 animate-spin text-amber-600" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" strokeDasharray="31.4 31.4" fill="none" /></svg> : null}
                        {isRunning ? "Validating" : "Run validation"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className={`${panelClass} sticky top-20 h-fit`}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">Current status</p>
          <p className="mt-2 text-lg font-semibold">{currentBusyCopy.label}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{currentBusyCopy.description}</p>
          <div className="mt-3 rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">Next: {nextStepMessage}</div>
          <div className="mt-4 border-t pt-3 text-sm">
            <h3 className="font-medium">Active data</h3>
            {!activeDataset ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No dataset loaded yet.</p>
            ) : (
              <dl className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Rows</dt>
                  <dd className="font-medium">{activeDataset.rows}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Descriptors</dt>
                  <dd className="font-medium">{activeDataset.descriptors}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Source</dt>
                  <dd className="font-medium capitalize">{activeDataset.source}</dd>
                </div>
              </dl>
            )}
          </div>
        </aside>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {busyState !== "idle" ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          {currentBusyCopy.label} is in progress. Keep the current files and settings in place until the step completes.
        </div>
      ) : null}

      <main className="grid gap-4 lg:grid-cols-3">
        <section className={`${panelClass} lg:col-span-2`}>
          <h2 className="text-lg font-medium">1. Load matrix and vector</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Start here. The mock backend uses the selected file names to build a dataset profile, so both inputs are required before any other step becomes meaningful.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">X matrix (.csv)</span>
              <input
                type="file"
                accept=".csv"
                className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                onChange={(event) =>
                  setMatrixFile(event.target.files?.[0] ?? null)
                }
              />
              <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">
                Selected: {matrixFileName || "no file yet"}
              </span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">y vector (.csv)</span>
              <input
                type="file"
                accept=".csv"
                className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                onChange={(event) =>
                  setVectorFile(event.target.files?.[0] ?? null)
                }
              />
              <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">
                Selected: {vectorFileName || "no file yet"}
              </span>
            </label>
          </div>
          <button
            type="button"
            disabled={busyState !== "idle"}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            onClick={handleLoadData}
          >
              {busyState === "loading-data" ? "Loading dataset..." : "Load dataset and unlock preprocessing"}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            You can also jump straight to the full pipeline once both files are selected.
          </p>
        </section>



        <section className={`${panelClass} lg:col-span-2`}>
          <h2 className="text-lg font-medium">2. Descriptor preprocessing</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Use these controls to reduce noisy descriptors and prepare the active matrix for model selection.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Variance cut"
              value={filterSettings.varCut}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                setFilterSettings((prev) => ({ ...prev, varCut: value }))
              }
            />
            <NumberField
              label="Correlation cut"
              value={filterSettings.corrCut}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                setFilterSettings((prev) => ({ ...prev, corrCut: value }))
              }
            />
            <NumberField
              label="Autocorrelation cut"
              value={filterSettings.autocorrCut}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                setFilterSettings((prev) => ({ ...prev, autocorrCut: value }))
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Switch
              label="Autoscale"
              checked={filterSettings.autoscale}
              onChange={(checked) =>
                setFilterSettings((prev) => ({ ...prev, autoscale: checked }))
              }
            />
            <Switch
              label="LJ transform"
              checked={filterSettings.ljTransform}
              onChange={(checked) =>
                setFilterSettings((prev) => ({ ...prev, ljTransform: checked }))
              }
            />
          </div>
          <button
            type="button"
            disabled={!canRunFilters}
            className="mt-4 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
            onClick={handleRunFilters}
          >
            {busyState === "filtering" ? "Filtering..." : "Apply filters to the active matrix"}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Disabled until a dataset is loaded.
          </p>
        </section>

        <section className={panelClass}>
          <h2 className="text-lg font-medium">3. Selection method</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Choose the selection strategy, then tune only the settings that belong to that method.
          </p>
          <fieldset className="mt-3 flex gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={selectionSettings.method === "ops"}
                onChange={() => setSelectionSettings((prev) => ({ ...prev, method: "ops" }))}
              />
              OPS
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="method"
                checked={selectionSettings.method === "ga"}
                onChange={() => setSelectionSettings((prev) => ({ ...prev, method: "ga" }))}
              />
              GA
            </label>
          </fieldset>

          <div className="mt-3 space-y-2">
            <NumberField
              label="Latent vars (model)"
              value={selectionSettings.latentVarsModel}
              min={1}
              max={30}
              step={1}
              onChange={(value) =>
                setSelectionSettings((prev) => ({ ...prev, latentVarsModel: value }))
              }
            />
            {selectionSettings.method === "ops" ? (
              <>
                <NumberField
                  label="Latent vars (OPS)"
                  value={selectionSettings.latentVarsOps}
                  min={1}
                  max={20}
                  step={1}
                  onChange={(value) =>
                    setSelectionSettings((prev) => ({ ...prev, latentVarsOps: value }))
                  }
                />
                <NumberField
                  label="Variables percentage"
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
                <NumberField
                  label="Min vars/model"
                  value={selectionSettings.minVarsModel}
                  min={1}
                  max={50}
                  step={1}
                  onChange={(value) =>
                    setSelectionSettings((prev) => ({ ...prev, minVarsModel: value }))
                  }
                />
                <NumberField
                  label="Max vars/model"
                  value={selectionSettings.maxVarsModel}
                  min={2}
                  max={200}
                  step={1}
                  onChange={(value) =>
                    setSelectionSettings((prev) => ({ ...prev, maxVarsModel: value }))
                  }
                />
                <NumberField
                  label="Population size"
                  value={selectionSettings.populationSize}
                  min={20}
                  max={300}
                  step={1}
                  onChange={(value) =>
                    setSelectionSettings((prev) => ({ ...prev, populationSize: value }))
                  }
                />
                <NumberField
                  label="Generations"
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
          <button
            type="button"
            disabled={!canRunSelection}
            className="mt-4 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
            onClick={handleRunSelection}
          >
            {busyState === "selecting" ? "Selecting..." : "Run variable selection on the active matrix"}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Disabled until preprocessing has produced an active dataset.
          </p>
        </section>

        <section className={`${panelClass} lg:col-span-2`}>
          <h2 className="text-lg font-medium">4. Validation suite</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Run whichever checks you need. These metrics show whether the selected model is stable enough to trust.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Switch
              label="Cross validation"
              checked={validationSettings.runCrossValidation}
              onChange={(checked) =>
                setValidationSettings((prev) => ({ ...prev, runCrossValidation: checked }))
              }
            />
            <Switch
              label="Y-randomization"
              checked={validationSettings.runYRandomization}
              onChange={(checked) =>
                setValidationSettings((prev) => ({ ...prev, runYRandomization: checked }))
              }
            />
            <Switch
              label="Leave-N-Out"
              checked={validationSettings.runLNO}
              onChange={(checked) =>
                setValidationSettings((prev) => ({ ...prev, runLNO: checked }))
              }
            />
            <Switch
              label="External validation"
              checked={validationSettings.runExternalValidation}
              onChange={(checked) =>
                setValidationSettings((prev) => ({ ...prev, runExternalValidation: checked }))
              }
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Y-rand cutoff"
              value={validationSettings.yrandCutoff}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                setValidationSettings((prev) => ({ ...prev, yrandCutoff: value }))
              }
            />
            <NumberField
              label="LNO cutoff"
              value={validationSettings.lnoCutoff}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                setValidationSettings((prev) => ({ ...prev, lnoCutoff: value }))
              }
            />
            <NumberField
              label="Test set ratio"
              value={validationSettings.testSetRatio}
              min={0.1}
              max={0.5}
              step={0.01}
              onChange={(value) =>
                setValidationSettings((prev) => ({ ...prev, testSetRatio: value }))
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canRunValidation}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
              onClick={handleRunValidation}
            >
              {busyState === "validating" ? "Validating..." : "Run validations for the selected model"}
            </button>
            <button
              type="button"
              disabled={!canRunPipeline}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleRunPipeline}
            >
              Run the full pipeline
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Full pipeline mode loads data, applies preprocessing, runs selection, and finishes with validation in one pass.
          </p>
        </section>

        <section className={panelClass}>
          <h2 className="text-lg font-medium">Results</h2>
          {!selectionResult ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Selection metrics will appear here after you run OPS or GA.
            </p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <Metric label="Method" value={selectionResult.method.toUpperCase()} />
              <Metric label="Selected descriptors" value={selectionResult.selectedDescriptors} />
              <Metric label="Latent variables" value={selectionResult.latentVariables} />
              <Metric label="Q²" value={selectionResult.q2.toFixed(3)} />
              <Metric label="R²" value={selectionResult.r2.toFixed(3)} />
              <Metric
                label="Package checks"
                value={selectionResult.validationPassed ? "Passed" : "Did not pass"}
              />
            </div>
          )}
          {validationResult ? (
            <div className="mt-4 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
              <h3 className="mb-2 font-medium">Validation output</h3>
              <div className="space-y-2">
                {validationResult.cv ? (
                  <Metric
                    label="Cross validation"
                    value={`Q² ${validationResult.cv.q2.toFixed(3)}, RMSE ${validationResult.cv.rmse}`}
                  />
                ) : null}
                {validationResult.yr ? (
                  <Metric
                    label="Y-randomization"
                    value={`${validationResult.yr.score.toFixed(3)} (${validationResult.yr.passed ? "pass" : "fail"})`}
                  />
                ) : null}
                {validationResult.lno ? (
                  <Metric
                    label="LNO"
                    value={`${validationResult.lno.score.toFixed(3)} (${validationResult.lno.passed ? "pass" : "fail"})`}
                  />
                ) : null}
                {validationResult.ext ? (
                  <Metric
                    label="External validation"
                    value={`R²pred ${validationResult.ext.r2Pred.toFixed(3)}, RMSEP ${validationResult.ext.rmsep}`}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className={`${panelClass} lg:col-span-3`}>
          <h2 className="text-lg font-medium">Workflow timeline</h2>
          {timeline.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Start by loading data to build your run history. Each action will be added here as a compact audit trail.
            </p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {timeline.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
