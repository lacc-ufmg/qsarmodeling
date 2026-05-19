import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  loadDataset,
  type DatasetProfile,
  type FilterSettings,
  type SelectionResult,
  type SelectionSettings,
  type ValidationResult,
  type ValidationSettings,
  runFilters,
  runPipeline,
  runSelection,
  runValidations,
} from "./lib/mockQsarBackend";

type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

type AppInfo = {
  appName: string;
  platform: string;
  version: string;
};

const initialFilterSettings: FilterSettings = {
  varCut: 0.15,
  corrCut: 0.25,
  autocorrCut: 0.25,
  autoscale: true,
  ljTransform: false,
};

const initialSelectionSettings: SelectionSettings = {
  method: "ops",
  latentVarsModel: 6,
  latentVarsOps: 4,
  varsPercentage: 15,
  minVarsModel: 8,
  maxVarsModel: 30,
  populationSize: 80,
  generations: 40,
};

const initialValidationSettings: ValidationSettings = {
  runCrossValidation: true,
  runYRandomization: true,
  runLNO: true,
  runExternalValidation: true,
  yrandCutoff: 0.3,
  lnoCutoff: 0.1,
  testSetRatio: 0.2,
};

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <span className="tooltip-wrap">
      <button
        type="button"
        className="tooltip-trigger"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
      >
        ?
      </button>
      {show ? <span className="tooltip-bubble">{text}</span> : null}
    </span>
  );
}

function ExpandableSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="expandable">
      <button type="button" className="expandable__toggle" onClick={() => setExpanded((value) => !value)}>
        <span className={`expandable__chevron ${expanded ? "is-expanded" : ""}`}>⌄</span>
        {title}
      </button>
      {expanded ? <div className="expandable__content">{children}</div> : null}
    </div>
  );
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="result-card">
      <h3 className="result-card__title">{title}</h3>
      <div className="result-card__body">{children}</div>
    </div>
  );
}

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
    <label className="field">
      <div className="field__label-row">
        <span className="field__label">{label}</span>
        <Tooltip text={help} />
      </div>
      <input
        className="input"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function App() {
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [vectorFile, setVectorFile] = useState<File | null>(null);
  const [uploadedDataset, setUploadedDataset] = useState<DatasetProfile | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetProfile | null>(null);
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [busyState, setBusyState] = useState<BusyState>("idle");
  const [error, setError] = useState("");
  const [timeline, setTimeline] = useState<string[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appInfoError, setAppInfoError] = useState("");

  const [filterSettings, setFilterSettings] = useState<FilterSettings>(initialFilterSettings);
  const [selectionSettings, setSelectionSettings] = useState<SelectionSettings>(initialSelectionSettings);
  const [validationSettings, setValidationSettings] = useState<ValidationSettings>(initialValidationSettings);

  useEffect(() => {
    let mounted = true;

    invoke<AppInfo>("app_info")
      .then((info) => {
        if (mounted) {
          setAppInfo(info);
        }
      })
      .catch((invokeError: unknown) => {
        if (mounted) {
          setAppInfoError(invokeError instanceof Error ? invokeError.message : "Failed to read app info.");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

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

  const currentBusyCopy = busyCopy[busyState];

  const nextStepMessage = useMemo(() => {
    if (busyState !== "idle") {
      return `Wait for ${currentBusyCopy.label.toLowerCase()} to finish before moving on.`;
    }

    if (!matrixFile || !vectorFile) {
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
  }, [busyState, currentBusyCopy.label, matrixFile, uploadedDataset, selectionResult, validationResult, vectorFile]);

  const stages = useMemo(
    () => [
      {
        label: "Data",
        status: uploadedDataset ? "Loaded" : matrixFile && vectorFile ? "Ready to load" : "Waiting for files",
        detail: uploadedDataset
          ? `${uploadedDataset.matrixName} and ${uploadedDataset.vectorName}`
          : "Choose both X and y CSV files first.",
      },
      {
        label: "Preprocessing",
        status: activeDataset?.source === "filtered" ? "Applied" : uploadedDataset ? "Ready to run" : "Blocked",
        detail: activeDataset?.source === "filtered"
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
        detail: validationResult ? "Validation metrics are available below." : "Run the checks you want to inspect.",
      },
    ],
    [activeDataset, matrixFile, selectionResult, uploadedDataset, validationResult, vectorFile],
  );

  const canRunFilters = Boolean(activeDataset) && busyState === "idle";
  const canRunSelection = Boolean(activeDataset) && busyState === "idle";
  const canRunValidation = Boolean(selectionResult) && busyState === "idle";
  const canRunPipeline = Boolean(matrixFile && vectorFile) && busyState === "idle";
  const canLoadData = Boolean(matrixFile && vectorFile) && busyState === "idle";

  const appendTimeline = (message: string): void => {
    setTimeline((current) => [`${new Date().toLocaleTimeString()} - ${message}`, ...current.slice(0, 7)]);
  };

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
    if (!uploadedDataset) {
      return;
    }

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
    if (!uploadedDataset) {
      return;
    }

    setBusyState("selecting");

    try {
      const selected = await runSelection(uploadedDataset.sessionId, filterSettings, selectionSettings);
      setSelectionResult(selected);
      setValidationResult(null);
      appendTimeline(
        `${selected.method.toUpperCase()} selected ${selected.selectedDescriptors} descriptors (Q² ${selected.q2.toFixed(3)}).`,
      );
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to run variable selection.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunValidation(): Promise<void> {
    if (!uploadedDataset) {
      return;
    }

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
      const pipeline = await runPipeline(loaded.sessionId, filterSettings, selectionSettings, validationSettings);
      setActiveDataset(pipeline.dataset);
      setSelectionResult(pipeline.selection);
      setValidationResult(pipeline.validation);
      appendTimeline(`Applied descriptor filters. Active matrix now has ${pipeline.dataset.descriptors} descriptors.`);
      appendTimeline(
        `${pipeline.selection.method.toUpperCase()} selected ${pipeline.selection.selectedDescriptors} descriptors (Q² ${pipeline.selection.q2.toFixed(3)}).`,
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
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--one" />
      <div className="app-shell__glow app-shell__glow--two" />

      <main className="workspace">
        <header className="hero">
          <div className="hero__topline">
            <span className="eyebrow">Guided workflow</span>
            <span className="status-chip">
              {appInfo ? `${appInfo.appName} · ${appInfo.platform}` : appInfoError || "Desktop runtime"}
            </span>
          </div>

          <h1>QSAR Model Builder</h1>
          <p className="hero__lead">
            A desktop workflow for QSAR model development. Load data, apply descriptor filters, select variables,
            and validate results in one local app.
          </p>

          <div className="hero__meta">
            <span className="meta-pill">Vite + React</span>
            <span className="meta-pill">Tauri desktop</span>
            <span className="meta-pill">Rust bridge</span>
            {appInfo ? <span className="meta-pill">v{appInfo.version}</span> : null}
          </div>
        </header>

        {error ? <section className="alert alert--error">{error}</section> : null}

        {busyState !== "idle" ? (
          <section className="alert alert--busy">
            <div className="spinner" aria-hidden="true" />
            <div>
              <strong>{currentBusyCopy.label}</strong>
              <p>{currentBusyCopy.description}</p>
            </div>
          </section>
        ) : null}

        <section className="status-panel">
          <div>
            <p className="status-panel__label">Current status</p>
            <h2>{currentBusyCopy.label}</h2>
          </div>
          <p className="status-panel__message">{nextStepMessage}</p>
        </section>

        <section className="stage-grid">
          {stages.map((stage) => (
            <article className="stage-card" key={stage.label}>
              <div className="stage-card__header">
                <span className="stage-card__label">{stage.label}</span>
                <span className="stage-card__status">{stage.status}</span>
              </div>
              <p>{stage.detail}</p>
            </article>
          ))}
        </section>

        <div className="panels">
          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="step-badge">1</div>
                <h2>Load your data</h2>
                <p>Upload CSV files for the descriptor matrix and target vector.</p>
              </div>
              {uploadedDataset ? <span className="checkmark">✓</span> : null}
            </div>

            {!uploadedDataset ? (
              <>
                <div className="file-grid">
                  <label className="field">
                    <span className="field__label">X matrix (.csv)</span>
                    <input className="input input--file" type="file" accept=".csv" onChange={(event) => setMatrixFile(event.target.files?.[0] ?? null)} />
                    <span className="field__hint">{matrixFile?.name || "No file selected"}</span>
                  </label>

                  <label className="field">
                    <span className="field__label">y vector (.csv)</span>
                    <input className="input input--file" type="file" accept=".csv" onChange={(event) => setVectorFile(event.target.files?.[0] ?? null)} />
                    <span className="field__hint">{vectorFile?.name || "No file selected"}</span>
                  </label>
                </div>

                <button className="button button--primary" disabled={!canLoadData} type="button" onClick={handleLoadData}>
                  {busyState === "loading-data" ? <span className="button__spinner" /> : null}
                  {busyState === "loading-data" ? "Loading dataset..." : "Load dataset"}
                </button>
              </>
            ) : null}

            {uploadedDataset ? (
              <ResultCard title="Dataset loaded successfully">
                <div className="stats-grid stats-grid--three">
                  <div>
                    <span>Rows</span>
                    <strong>{uploadedDataset.rows}</strong>
                  </div>
                  <div>
                    <span>Descriptors</span>
                    <strong>{uploadedDataset.descriptors}</strong>
                  </div>
                  <div>
                    <span>Files</span>
                    <strong>{uploadedDataset.matrixName}</strong>
                    <strong>{uploadedDataset.vectorName}</strong>
                  </div>
                </div>
              </ResultCard>
            ) : null}
          </section>

          <section className={`panel ${!uploadedDataset ? "panel--muted" : ""}`}>
            <div className="panel__header">
              <div>
                <div className="step-badge">2</div>
                <h2>Filter descriptors</h2>
                <p>Remove noisy variables before model selection.</p>
              </div>
              {activeDataset?.source === "filtered" ? <span className="checkmark">✓</span> : null}
            </div>

            {uploadedDataset ? (
              <>
                <div className="card-surface">
                  <p className="card-surface__title">Basic settings</p>
                  <div className="field-grid field-grid--three">
                    <NumberFieldWithTooltip
                      label="Variance cut"
                      help="Removes descriptors with low variance across samples. Higher values filter more aggressively."
                      value={filterSettings.varCut}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => setFilterSettings((prev) => ({ ...prev, varCut: value }))}
                    />
                    <NumberFieldWithTooltip
                      label="Correlation cut"
                      help="Removes highly correlated descriptors to reduce multicollinearity. Higher values filter more aggressively."
                      value={filterSettings.corrCut}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => setFilterSettings((prev) => ({ ...prev, corrCut: value }))}
                    />
                    <NumberFieldWithTooltip
                      label="Autocorrelation cut"
                      help="Removes descriptors with high autocorrelation within themselves. Lower values filter more aggressively."
                      value={filterSettings.autocorrCut}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => setFilterSettings((prev) => ({ ...prev, autocorrCut: value }))}
                    />
                  </div>
                </div>

                <ExpandableSection title="Fine-tune settings">
                  <div className="option-stack">
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={filterSettings.autoscale}
                        onChange={(event) => setFilterSettings((prev) => ({ ...prev, autoscale: event.target.checked }))}
                      />
                      <span>
                        <strong>Autoscale</strong>
                        <span>Mean-center and scale to unit variance.</span>
                      </span>
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={filterSettings.ljTransform}
                        onChange={(event) => setFilterSettings((prev) => ({ ...prev, ljTransform: event.target.checked }))}
                      />
                      <span>
                        <strong>LJ transform</strong>
                        <span>Apply Lennard-Jones descriptor transformation.</span>
                      </span>
                    </label>
                  </div>
                </ExpandableSection>

                <button className="button button--secondary" disabled={!canRunFilters} type="button" onClick={handleRunFilters}>
                  {busyState === "filtering" ? <span className="button__spinner" /> : null}
                  {busyState === "filtering" ? "Applying filters..." : "Apply filters"}
                </button>
              </>
            ) : (
              <p className="empty-state">Load a dataset first to enable filtering.</p>
            )}

            {activeDataset?.source === "filtered" ? (
              <ResultCard title="Filters applied successfully">
                <div className="stats-grid stats-grid--two">
                  <div>
                    <span>Active descriptors</span>
                    <strong>{activeDataset.descriptors}</strong>
                  </div>
                  <div>
                    <span>Removed</span>
                    <strong>{uploadedDataset ? uploadedDataset.descriptors - activeDataset.descriptors : 0}</strong>
                  </div>
                </div>
              </ResultCard>
            ) : null}
          </section>

          <section className={`panel ${!activeDataset ? "panel--muted" : ""}`}>
            <div className="panel__header">
              <div>
                <div className="step-badge">3</div>
                <h2>Select variables</h2>
                <p>Choose the best subset of descriptors for your model.</p>
              </div>
              {selectionResult ? <span className="checkmark">✓</span> : null}
            </div>

            {activeDataset ? (
              <>
                <div className="card-surface">
                  <p className="card-surface__title">Choose selection method</p>
                  <div className="choice-grid">
                    <label className={`choice-card ${selectionSettings.method === "ops" ? "choice-card--active" : ""}`}>
                      <input type="radio" checked={selectionSettings.method === "ops"} onChange={() => setSelectionSettings((prev) => ({ ...prev, method: "ops" }))} />
                      <span>
                        <strong>OPS</strong>
                        <span>Orthogonal Projections to Latent Structures</span>
                      </span>
                    </label>

                    <label className={`choice-card ${selectionSettings.method === "ga" ? "choice-card--active" : ""}`}>
                      <input type="radio" name="method" checked={selectionSettings.method === "ga"} onChange={() => setSelectionSettings((prev) => ({ ...prev, method: "ga" }))} />
                      <span>
                        <strong>GA</strong>
                        <span>Genetic Algorithm</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="card-surface card-surface--spaced">
                  <p className="card-surface__title">Basic settings</p>
                  <div className="field-grid field-grid--two">
                    <NumberFieldWithTooltip
                      label="Latent variables (model)"
                      help="Number of latent variables (PLS components) in the final model. Higher values provide better quality with longer calculations."
                      value={selectionSettings.latentVarsModel}
                      min={1}
                      max={30}
                      step={1}
                      onChange={(value) => setSelectionSettings((prev) => ({ ...prev, latentVarsModel: value }))}
                    />

                    {selectionSettings.method === "ops" ? (
                      <NumberFieldWithTooltip
                        label="Latent variables (OPS)"
                        help="Number of latent variables used during OPS selection process. Higher values increase computational cost but may improve robustness."
                        value={selectionSettings.latentVarsOps}
                        min={1}
                        max={20}
                        step={1}
                        onChange={(value) => setSelectionSettings((prev) => ({ ...prev, latentVarsOps: value }))}
                      />
                    ) : null}
                  </div>
                </div>

                <ExpandableSection title={`${selectionSettings.method === "ops" ? "OPS" : "GA"} fine-tuning`}>
                  <div className="option-stack">
                    {selectionSettings.method === "ops" ? (
                      <NumberFieldWithTooltip
                        label="Variables percentage"
                        help="Percentage of descriptors to evaluate during OPS selection. Lower values reduce search space but may miss optimal features."
                        value={selectionSettings.varsPercentage}
                        min={1}
                        max={60}
                        step={1}
                        onChange={(value) => setSelectionSettings((prev) => ({ ...prev, varsPercentage: value }))}
                      />
                    ) : (
                      <>
                        <NumberFieldWithTooltip
                          label="Min vars per model"
                          help="Minimum number of descriptors in any candidate model. Higher values create more complex models but reduce overfitting risk."
                          value={selectionSettings.minVarsModel}
                          min={1}
                          max={50}
                          step={1}
                          onChange={(value) => setSelectionSettings((prev) => ({ ...prev, minVarsModel: value }))}
                        />
                        <NumberFieldWithTooltip
                          label="Max vars per model"
                          help="Maximum number of descriptors in any candidate model. Lower values favor simpler models; higher values allow more complex solutions."
                          value={selectionSettings.maxVarsModel}
                          min={2}
                          max={200}
                          step={1}
                          onChange={(value) => setSelectionSettings((prev) => ({ ...prev, maxVarsModel: value }))}
                        />
                        <NumberFieldWithTooltip
                          label="Population size"
                          help="Number of models in each generation of the genetic algorithm. Larger populations explore the search space better but increase computation time."
                          value={selectionSettings.populationSize}
                          min={20}
                          max={300}
                          step={1}
                          onChange={(value) => setSelectionSettings((prev) => ({ ...prev, populationSize: value }))}
                        />
                        <NumberFieldWithTooltip
                          label="Generations"
                          help="Number of generations to evolve in the genetic algorithm. More generations improve convergence but require longer computation."
                          value={selectionSettings.generations}
                          min={10}
                          max={500}
                          step={1}
                          onChange={(value) => setSelectionSettings((prev) => ({ ...prev, generations: value }))}
                        />
                      </>
                    )}
                  </div>
                </ExpandableSection>

                <button className="button button--secondary" disabled={!canRunSelection} type="button" onClick={handleRunSelection}>
                  {busyState === "selecting" ? <span className="button__spinner" /> : null}
                  {busyState === "selecting" ? "Running selection..." : `Run ${selectionSettings.method.toUpperCase()}`}
                </button>
              </>
            ) : (
              <p className="empty-state">Complete preprocessing first to enable variable selection.</p>
            )}

            {selectionResult ? (
              <ResultCard title="Selection completed">
                <div className="stats-grid stats-grid--three">
                  <div>
                    <span>Method</span>
                    <strong>{selectionResult.method.toUpperCase()}</strong>
                  </div>
                  <div>
                    <span>Descriptors</span>
                    <strong>{selectionResult.selectedDescriptors}</strong>
                  </div>
                  <div>
                    <span>Q²</span>
                    <strong>{selectionResult.q2.toFixed(3)}</strong>
                  </div>
                  <div>
                    <span>R²</span>
                    <strong>{selectionResult.r2.toFixed(3)}</strong>
                  </div>
                  <div>
                    <span>Latent variables</span>
                    <strong>{selectionResult.latentVariables}</strong>
                  </div>
                  <div>
                    <span>Validated</span>
                    <strong>{selectionResult.validationPassed ? "Yes" : "No"}</strong>
                  </div>
                </div>
              </ResultCard>
            ) : null}
          </section>

          <section className={`panel ${!selectionResult ? "panel--muted" : ""}`}>
            <div className="panel__header">
              <div>
                <div className="step-badge">4</div>
                <h2>Validate model</h2>
                <p>Run validation tests to confirm model quality and stability.</p>
              </div>
              {validationResult ? <span className="checkmark">✓</span> : null}
            </div>

            {selectionResult ? (
              <>
                <div className="card-surface">
                  <p className="card-surface__title">Choose validation tests</p>
                  <div className="choice-grid choice-grid--two">
                    <label className="toggle-card">
                      <input
                        type="checkbox"
                        checked={validationSettings.runCrossValidation}
                        onChange={(event) => setValidationSettings((prev) => ({ ...prev, runCrossValidation: event.target.checked }))}
                      />
                      <span>Cross validation</span>
                    </label>
                    <label className="toggle-card">
                      <input
                        type="checkbox"
                        checked={validationSettings.runYRandomization}
                        onChange={(event) => setValidationSettings((prev) => ({ ...prev, runYRandomization: event.target.checked }))}
                      />
                      <span>Y-randomization</span>
                    </label>
                    <label className="toggle-card">
                      <input
                        type="checkbox"
                        checked={validationSettings.runLNO}
                        onChange={(event) => setValidationSettings((prev) => ({ ...prev, runLNO: event.target.checked }))}
                      />
                      <span>Leave-N-Out</span>
                    </label>
                    <label className="toggle-card">
                      <input
                        type="checkbox"
                        checked={validationSettings.runExternalValidation}
                        onChange={(event) => setValidationSettings((prev) => ({ ...prev, runExternalValidation: event.target.checked }))}
                      />
                      <span>External validation</span>
                    </label>
                  </div>
                </div>

                <ExpandableSection title="Fine-tune thresholds">
                  <div className="field-grid field-grid--three">
                    <NumberFieldWithTooltip
                      label="Y-rand cutoff"
                      help="Threshold for Y-randomization test. Models above this are likely overfit."
                      value={validationSettings.yrandCutoff}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => setValidationSettings((prev) => ({ ...prev, yrandCutoff: value }))}
                    />
                    <NumberFieldWithTooltip
                      label="LNO cutoff"
                      help="Threshold for Leave-N-Out test. Lower values are stricter; higher values accept more variation."
                      value={validationSettings.lnoCutoff}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => setValidationSettings((prev) => ({ ...prev, lnoCutoff: value }))}
                    />
                    <NumberFieldWithTooltip
                      label="Test set ratio"
                      help="Fraction of data to use for external validation."
                      value={validationSettings.testSetRatio}
                      min={0.1}
                      max={0.5}
                      step={0.01}
                      onChange={(value) => setValidationSettings((prev) => ({ ...prev, testSetRatio: value }))}
                    />
                  </div>
                </ExpandableSection>

                <div className="action-row">
                  <button className="button button--secondary" disabled={!canRunValidation} type="button" onClick={handleRunValidation}>
                    {busyState === "validating" ? <span className="button__spinner" /> : null}
                    {busyState === "validating" ? "Running validation..." : "Run validation"}
                  </button>

                  <button className="button button--accent" disabled={!canRunPipeline} type="button" onClick={handleRunPipeline}>
                    {busyState !== "idle" ? <span className="button__spinner" /> : null}
                    {busyState !== "idle" ? "Running full pipeline..." : "Run full pipeline"}
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-state">Complete variable selection first to enable validation.</p>
            )}

            {validationResult ? (
              <ResultCard title="Validation completed">
                <div className="validation-list">
                  {validationResult.cv ? (
                    <div className="validation-row">
                      <span>Cross validation Q²</span>
                      <strong>{validationResult.cv.q2.toFixed(3)}</strong>
                    </div>
                  ) : null}

                  {validationResult.yr ? (
                    <div className="validation-row">
                      <span>Y-randomization</span>
                      <strong className={validationResult.yr.passed ? "text-success" : "text-danger"}>
                        {validationResult.yr.score.toFixed(3)} {validationResult.yr.passed ? "PASS" : "FAIL"}
                      </strong>
                    </div>
                  ) : null}

                  {validationResult.lno ? (
                    <div className="validation-row">
                      <span>Leave-N-Out</span>
                      <strong className={validationResult.lno.passed ? "text-success" : "text-danger"}>
                        {validationResult.lno.score.toFixed(3)} {validationResult.lno.passed ? "PASS" : "FAIL"}
                      </strong>
                    </div>
                  ) : null}

                  {validationResult.ext ? (
                    <div className="validation-row">
                      <span>External validation R²pred</span>
                      <strong>{validationResult.ext.r2Pred.toFixed(3)}</strong>
                    </div>
                  ) : null}
                </div>
              </ResultCard>
            ) : null}
          </section>
        </div>

        {timeline.length > 0 ? (
          <section className="timeline-panel">
            <h2>Workflow history</h2>
            <ul className="timeline-list">
              {timeline.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
