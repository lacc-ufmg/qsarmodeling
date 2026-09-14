# User Journey

A step-by-step walkthrough of what QSAR Kit's UI actually does today. This describes the real
app, not an idealized one — see the callouts for places where the UI's behavior doesn't quite
match what a user would expect. For the underlying code structure, see
[`../CLAUDE.md`](../CLAUDE.md); for a consolidated list of known gaps, see its
[Known Issues](../CLAUDE.md#known-issues) section (this doc cross-links rather than repeating that
detail).

## The app shell

QSAR Kit is a **single page**, not a wizard: all four workflow panels — Load Data, Filter
Descriptors, Select Variables, Validate Model — are stacked vertically inside one
`WorkflowProvider` and are always present on screen (`src/App.tsx`). What changes as you progress
is:

- **Simple truthiness gates.** Each panel below the first checks whether the panel(s) before it
  produced a result (e.g. `!activeDataset` disables the Select panel) — there is no formal state
  machine, just `disabled={...}` props derived from context values.
- **A single global busy mutex.** `WorkflowContext` exposes one `GlobalBusyState` (`idle |
  loading-data | filtering | selecting | validating`). Any panel currently doing work sets it, and
  every panel's "run" button is disabled unless it's `idle` — so only one long-running operation
  can be in flight across the whole app at a time.

## Step 1 — Load Data

Two ways to get a dataset into the session (`src/components/workflow/LoadDataPanel.tsx`):

- **Browse for files**: pick a descriptor matrix (`X.csv`) and a target vector (`y.csv`)
  separately via the native file picker, then click **Load dataset**. This calls
  `load_dataset_cmd`, which parses both CSVs into a `RawDataset` on the Rust side
  (`core/loader.rs`, auto-detecting delimiter/header/index column) and returns just the metadata
  (sample/descriptor counts) — the matrices themselves stay server-side.
- **Examples menu**: load one of three bundled datasets (Dream, Carbox, Carbox — big) via
  `load_example_dataset_cmd`, which resolves them from `src-tauri/examples/data/` using Tauri's
  resource directory. Useful for trying the app without your own data.

Either path populates both `uploadedDataset` and `activeDataset` in `WorkflowContext`, which is
what unlocks Step 2 (and, as covered below, Step 3).

## Step 2 — Filter Descriptors

`src/components/workflow/FilterPanel.tsx` exposes three sliders that map directly to
`FilterConfig` fields sent to `apply_filter_cmd`:

| Slider | Field | Effect |
|---|---|---|
| Variance filter | `varianceCut` | Drops columns whose variance is at or below this threshold. |
| Correlation filter | `correlationCut` | Drops columns whose correlation with the target is at or below this threshold. |
| Collinearity filter | `autocorrelationCut` | Drops columns that are more inter-correlated than this threshold. |

Clicking **Apply filters** calls `apply_filter_cmd`, which re-runs the three filters against the
dataset's pre-computed column statistics (cheap — the expensive stats pass happened once at load
time) and updates `activeDataset.n_features` to the number of surviving descriptors.

> [!CAUTION]
> **Autoscale has no backend effect.** There's also an "Autoscale (mean-center and
> scale to unit variance)" checkbox, wired to `FilterConfig.autoscale`. Toggling it changes
> nothing: `FilterPipeline::run` always normalizes columns internally before computing the
> filters, regardless of this flag's value. See
> [CLAUDE.md § Known Issues](../CLAUDE.md#known-issues).

## Step 3 — Select Variables

`SelectionPanel` offers two independent strategies via a segmented control — **GA is the default**
selected mode. Both require an `activeDataset` and are mutually exclusive per run (only one panel
is shown at a time; switching modes doesn't cancel a run in the other).

> [!CAUTION]
> **The real required order is Load → Filter → Select, but the UI only enforces Load → Select.**
> `SelectionPanel` unlocks as soon as `activeDataset` is set — right after Step 1
> — not after Step 2 completes. Nothing stops you from clicking "Run OPS" or "Run GA" before
> applying any filter. If you do, the backend call fails with a plain `"No filter result"` string
> error (from `SessionState::materialize_last_x`, which both selection commands call to fetch the
> *filtered* matrix), surfaced in the panel's error `Alert`. In practice: **always run Filter before Select**,
> even though the UI lets you try otherwise.

### OPS (`OpsPanel.tsx`)

Four sliders map to `OpsConfig` (`latentVarsOps`, `latentVarsModel`, `varsPercentage`,
`minVarsModel`) and are sent to `run_selection_cmd`. The result summary shows selected-descriptor
count, best RMSECV, evaluation-step count, ranked-descriptor count, and the configured latent
variable count. `OpsResult` also carries a `bestQ2` field (the Q² at the best RMSECV point) that
the backend computes and returns, but the panel never displays it.

### GA (`GaPanel.tsx`)

Only six of `GAConfig`'s fields are exposed as UI controls: population size, max generations,
stale-generation stop, CV folds, min features, and max features. Everything else
(`replacementRate`, `elitismRate`, `tournamentSize`, `crossoverSelectionRate`, `crossoverRate`,
`mutationProbability`, `ridgeLambda`, `sizePenalty`, `fitnessPrecision`, `seed`, `parFitness`,
`targetFitnessScore`) is sent from a hardcoded `DEFAULT_GA_SETTINGS` object and is not
user-adjustable from this panel. Note also that the "CV folds" field you *can* adjust has no
effect on fitness scoring today — see
[CLAUDE.md § Known Issues](../CLAUDE.md#known-issues) (`GAConfig.cv_folds` is unused; fitness
always uses leave-one-out).

Clicking **Run GA** opens a Tauri `Channel<GaProgressEvent>` before invoking `run_ga_selection_cmd`
and attaches an `onmessage` handler that updates a live progress card (percentage, current/max
generation, stale-generation count) as the Rust side reports `Start`/`Generation`/`Finish` events
during the run. While a run is in flight, a **Send abort signal** button appears; it calls
`ga_send_abort`, which flips a cooperative `AtomicBool` the GA checks between generations — it is
a request to stop, not an instant cancel, so the run finishes its current generation first.

## Step 4 — Validate Model

`ValidationPanel.tsx` is **entirely mocked**. Its UI (checkboxes for which tests to run, threshold
fields for Y-randomization/LNO/external-validation cutoffs, a "Run validation" button and a "Run
full pipeline" button) is fully built, but:

- **"Run validation"** doesn't call any backend command — it just writes a hardcoded
  `mockResult` (all-zero Q², failed Y-randomization, failed LNO, zero external R²) into state
  after an `await`-free `try` block.
- **"Run full pipeline"** is a no-op — it's permanently disabled (`canRunPipeline = false`) and,
  even if enabled, its click handler currently only `console.log`s.
- **No Tauri command exists for this at all.** The `validation/*` Rust modules this panel would
  eventually call are fully implemented and unit-tested (see the `validation/` bullet under
  "Rust backend" in [`../CLAUDE.md`](../CLAUDE.md)) but are not in `invoke_handler!`, so there is
  nothing yet for the frontend to call.

The one honest signal in the UI is the **"Coming soon" badge** the panel renders (via
`StepCard`'s `futurePreview` prop) — that badge is accurate; nothing else about this panel's
result output should be trusted as reflecting a real computation.

## Known limitations — summary

Full detail lives in [CLAUDE.md § Known Issues](../CLAUDE.md#known-issues); this table only maps
each workflow step to what's actually broken or missing about it.

| Step | Limitation |
|---|---|
| 2. Filter | Autoscale checkbox has no backend effect. |
| 3. Select | UI unlocks selection right after Load, not after Filter; running before filtering fails with a raw `"No filter result"` error. |
| 3. Select (OPS) | `bestQ2` is computed but never shown. |
| 3. Select (GA) | Most `GAConfig` fields are hardcoded, not user-adjustable; `cvFolds` is adjustable but has no effect (fitness is always LOO-CV). |
| 4. Validate | Entirely mocked — no backend command exists yet. |
