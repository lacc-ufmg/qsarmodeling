"use client";

import { useMemo, useState } from "react";
import {
  type DatasetProfile,
  type FilterSettings,
  type SelectionResult,
  type SelectionSettings,
  type ValidationResult,
  type ValidationSettings,
  mockLoadDataset,
  mockRunFilters,
  mockRunSelection,
  mockRunValidations,
} from "@/lib/mockQsarBackend";

type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

const panelClass =
  "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

export default function Home() {
  const [matrixFileName, setMatrixFileName] = useState("");
  const [vectorFileName, setVectorFileName] = useState("");

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

  const appendTimeline = (message: string): void => {
    setTimeline((current) => [
      `${new Date().toLocaleTimeString()} - ${message}`,
      ...current.slice(0, 7),
    ]);
  };

  const canRunFilters = Boolean(activeDataset) && busyState === "idle";
  const canRunSelection = Boolean(activeDataset) && busyState === "idle";
  const canRunValidation = Boolean(selectionResult) && busyState === "idle";
  const canRunPipeline = Boolean(matrixFileName && vectorFileName) && busyState === "idle";

  const stages = useMemo(
    () => [
      {
        label: "Data",
        status: uploadedDataset ? "done" : "pending",
      },
      {
        label: "Preprocessing",
        status:
          activeDataset?.source === "filtered"
            ? "done"
            : uploadedDataset
              ? "ready"
              : "pending",
      },
      {
        label: "Selection",
        status: selectionResult ? "done" : activeDataset ? "ready" : "pending",
      },
      {
        label: "Validation",
        status: validationResult ? "done" : selectionResult ? "ready" : "pending",
      },
    ],
    [activeDataset, selectionResult, uploadedDataset, validationResult]
  );

  async function handleLoadData(): Promise<void> {
    if (!matrixFileName || !vectorFileName) {
      setError("Select both X matrix and y vector files before loading.");
      return;
    }
    setError("");
    setBusyState("loading-data");
    try {
      const loaded = await mockLoadDataset(matrixFileName, vectorFileName);
      setUploadedDataset(loaded);
      setActiveDataset(loaded);
      setSelectionResult(null);
      setValidationResult(null);
      appendTimeline(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunFilters(): Promise<void> {
    if (!activeDataset) return;
    setBusyState("filtering");
    try {
      const filtered = await mockRunFilters(activeDataset, filterSettings);
      setActiveDataset(filtered);
      setSelectionResult(null);
      setValidationResult(null);
      appendTimeline(`Applied descriptor filters. Active matrix now has ${filtered.descriptors} descriptors.`);
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunSelection(): Promise<void> {
    if (!activeDataset) return;
    setBusyState("selecting");
    try {
      const selected = await mockRunSelection(activeDataset, selectionSettings);
      setSelectionResult(selected);
      setValidationResult(null);
      appendTimeline(
        `${selected.method.toUpperCase()} selected ${selected.selectedDescriptors} descriptors (Q² ${selected.q2.toFixed(3)}).`
      );
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunValidation(): Promise<void> {
    if (!selectionResult) return;
    setBusyState("validating");
    try {
      const results = await mockRunValidations(selectionResult, validationSettings);
      setValidationResult(results);
      appendTimeline("Validation suite completed.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunPipeline(): Promise<void> {
    if (!matrixFileName || !vectorFileName) {
      setError("Select both X matrix and y vector files before running the full pipeline.");
      return;
    }

    setError("");
    setBusyState("loading-data");
    try {
      const loaded = await mockLoadDataset(matrixFileName, vectorFileName);
      setUploadedDataset(loaded);
      appendTimeline(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);

      setBusyState("filtering");
      const filtered = await mockRunFilters(loaded, filterSettings);
      setActiveDataset(filtered);
      appendTimeline(`Applied descriptor filters. Active matrix now has ${filtered.descriptors} descriptors.`);

      setBusyState("selecting");
      const selected = await mockRunSelection(filtered, selectionSettings);
      setSelectionResult(selected);
      appendTimeline(
        `${selected.method.toUpperCase()} selected ${selected.selectedDescriptors} descriptors (Q² ${selected.q2.toFixed(3)}).`
      );

      setBusyState("validating");
      const validated = await mockRunValidations(selected, validationSettings);
      setValidationResult(validated);
      appendTimeline("Validation suite completed.");
      appendTimeline("Full pipeline finished with mocked backend responses.");
    } finally {
      setBusyState("idle");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 text-zinc-900 dark:text-zinc-100 sm:px-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">QSAR Model Builder</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Guided flow based on QSARModelingPyInterfaces: load data, preprocess descriptors, run OPS/GA, validate, and inspect results.
        </p>
      </header>

      <div className="mb-5 grid gap-2 sm:grid-cols-4">
        {stages.map((stage) => (
          <div key={stage.label} className={`${panelClass} py-3`}>
            <p className="text-sm font-medium">{stage.label}</p>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{stage.status}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <main className="grid gap-4 lg:grid-cols-3">
        <section className={`${panelClass} lg:col-span-2`}>
          <h2 className="text-lg font-medium">1. Load matrix and vector</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">X matrix (.csv)</span>
              <input
                type="file"
                accept=".csv"
                className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                onChange={(event) =>
                  setMatrixFileName(event.target.files?.[0]?.name ?? "")
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">y vector (.csv)</span>
              <input
                type="file"
                accept=".csv"
                className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                onChange={(event) =>
                  setVectorFileName(event.target.files?.[0]?.name ?? "")
                }
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busyState !== "idle"}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            onClick={handleLoadData}
          >
            {busyState === "loading-data" ? "Loading..." : "Load dataset"}
          </button>
        </section>

        <section className={panelClass}>
          <h2 className="text-lg font-medium">Active data summary</h2>
          {!activeDataset ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No dataset loaded yet.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
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
        </section>

        <section className={`${panelClass} lg:col-span-2`}>
          <h2 className="text-lg font-medium">2. Descriptor preprocessing</h2>
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
            {busyState === "filtering" ? "Filtering..." : "Apply filters and update active matrix"}
          </button>
        </section>

        <section className={panelClass}>
          <h2 className="text-lg font-medium">3. Selection method</h2>
          <fieldset className="mt-3 flex gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="method"
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
            {busyState === "selecting" ? "Selecting..." : "Run variable selection"}
          </button>
        </section>

        <section className={`${panelClass} lg:col-span-2`}>
          <h2 className="text-lg font-medium">4. Validation suite</h2>
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
              {busyState === "validating" ? "Validating..." : "Run validations"}
            </button>
            <button
              type="button"
              disabled={!canRunPipeline}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleRunPipeline}
            >
              Run complete mocked pipeline
            </button>
          </div>
        </section>

        <section className={panelClass}>
          <h2 className="text-lg font-medium">Results</h2>
          {!selectionResult ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Selection metrics will appear here.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <Metric label="Method" value={selectionResult.method.toUpperCase()} />
              <Metric label="Selected descriptors" value={selectionResult.selectedDescriptors} />
              <Metric label="Latent variables" value={selectionResult.latentVariables} />
              <Metric label="Q²" value={selectionResult.q2.toFixed(3)} />
              <Metric label="R²" value={selectionResult.r2.toFixed(3)} />
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
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Start by loading data to build your run history.</p>
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
