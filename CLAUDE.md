# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

qsarmodelers is a Tauri v2 desktop app (Rust backend + React/Vite frontend) for building and
validating QSAR (Quantitative Structure-Activity Relationship) predictive models from chemical
descriptor data. The user-facing workflow has four steps, presented as stacked panels in a single
page app: **Load data → Filter descriptors → Select variables (OPS or GA) → Validate model**. The
first three are fully wired end-to-end (Tauri command + React panel each); **Validate is currently
a frontend-only mock with no backend command** (see [Known Issues](#known-issues), and
`docs/USER_JOURNEY.md` for the full walkthrough of what each step actually does today).

`packages/qsarmodelingpy` is a git submodule (the predecessor Python project); it is not built as
part of this app.

## Commands

Requires Node v24 (see `.nvmrc`), `pnpm`, and `rustup`. Install deps with `pnpm install`. `just`
is optional but recommended (aliases shown below).

```sh
pnpm dev             # just dev / just d   — run the Tauri app in dev mode
pnpm build           # just build / just b — build the production app
cargo check          # just check / just c — type-check the Rust backend
cargo test           # just test / just t  — run all Rust tests
cargo fmt            # just fmt / just f   — format Rust code
cargo tauri-typegen generate   # just typegen / just gen / just g
```

- Run a single Rust test: `cargo test <test_name>` (or `cargo test -p qsarmodelers_lib <test_name>`
  from `src-tauri/`). Unit tests live inline (`mod tests`) at the bottom of most `core/*` and
  `validation/*` files.
- Benchmarks: `cargo bench` (see `src-tauri/benches/load_dataset.rs`, uses `criterion`).
- There is no frontend test runner configured; `vite build`/`tsc` (via `pnpm build`) is the
  practical check for TS/React changes.
- `just bump <major|minor|patch> [message]` bumps the version consistently across
  `src-tauri/tauri.conf.json`, `package.json`, and `Cargo.toml`, regenerates lockfiles, and
  commits — don't hand-edit version numbers in those files individually.

## Architecture

### Rust backend (`src-tauri/src/`)

- **`app/`** — the Tauri-facing layer. `commands.rs` declares almost every `#[tauri::command]`
  (thin wrappers that delegate to `SessionState`); the one exception is `app_info`, which lives in
  `lib.rs` next to the `invoke_handler!` list rather than in `commands.rs`. `session.rs` holds
  `SessionState`, a `Mutex`-protected struct that is the single source of truth for the *current*
  dataset, the computed `FilterPipeline`, and the last filter result — the frontend does not pass
  large matrices back and forth, it just references this server-side session. `error.rs` defines
  `QsarError`/`Result`, but they are dead code today: every real command path builds and returns
  ad-hoc `String` errors instead (see Known Issues). Note the ordering rule enforced by
  `SessionState::materialize_last_x`: `run_ops`/`run_ga` read the *last filter result*, not the raw
  dataset, so calling either before a successful `apply_filter_cmd` fails at runtime with
  `"No filter result"` — nothing in the UI currently prevents this (see Known Issues).
- **`core/`** — the QSAR pipeline stages, each independent of Tauri:
  - `loader.rs` parses `X.csv`/`y.csv` into a `RawDataset` (column-major `ndarray`), auto-detecting
    delimiter, header row, and index column.
  - `filter.rs` — `FilterPipeline` computes column statistics once per dataset, then cheaply
    re-runs variance/correlation/collinearity filters whenever `FilterConfig` changes (this is why
    it's cached on `SessionState` rather than recomputed per request).
  - `ops.rs` — Ordered Predictors Selection: ranks features via a global PLS1 model, then
    evaluates growing subsets by LOO-RMSECV to pick the best feature subset (see module doc
    comment for the two-phase algorithm).
  - `ga.rs` (+ `ga/config.rs`, `ga/events.rs`, `ga/fitness.rs`) — genetic-algorithm-based variable
    selection built on the `genetic_algorithm` crate. Runs long enough to need progress reporting
    (`GaProgressEvent` over a Tauri `Channel`) and cooperative abort (`AtomicBool` flag stored on
    `SessionState`, flipped by `ga_send_abort`).
  - `pls.rs` — shared PLS1 fitting helpers used across filter/ops/GA. `stats.rs` (i.e.
    `core/stats.rs`) is dead code (unreferenced outside itself) — don't confuse it with
    `utils/stats.rs` below, which is what's actually used.
  - `commands::ExampleDataset` (an enum — `Dream`/`Carbox`/`CarboxBig`) and
    `commands::load_example_dataset_cmd` resolve bundled example datasets under
    `src-tauri/examples/data/` via Tauri's resource `BaseDirectory`; this is what backs the
    "Examples" menu on the Load Data panel.
- **`utils/`** (`src-tauri/src/utils.rs` + `utils/stats.rs`, a sibling of `core/`, declared as
  `crate::utils`) — small numeric helpers used throughout `core/` and `validation/`:
  `select_columns` and `mat_inv_gauss` (Gauss-Jordan inverse) in `utils.rs`; `min_max`, `r2`,
  `rmse`, `mae`, `pearson_r`, `f_stat`, `linear_regression`, `rm2_metrics`, `ssy`, `press`, etc. in
  `utils/stats.rs`.
- **`validation/`** — post-selection model validation: `loo.rs` (leave-one-out), `lno.rs`
  (leave-N-out), `kfold.rs`, `yrand.rs` (Y-randomization), `metrics.rs` (Q², RMSECV, R², etc.,
  shared by all validation methods). These operate on an already-selected feature subset.
  **The module is fully implemented and unit-tested but not wired to anything**: there is no
  `#[tauri::command]` for it, it's absent from `invoke_handler!`, there's no generated TS binding,
  and no frontend panel calls it — `ValidationPanel.tsx` only shows a hardcoded mock result (see
  Known Issues).

Data flows one-way through these stages: `loader` → `filter` (cached pipeline) → `ops`/`ga`
(requires a prior `apply_filter_cmd` call — reads the *filtered* matrix via
`SessionState::materialize_last_x`) → `validation` (implemented, but not yet reachable from the
UI). Each stage's config/result types derive `Serialize`/`Deserialize` with
`#[serde(rename_all = "camelCase")]` so they cross the IPC boundary cleanly into TypeScript.

### Generated bindings (`src/generated/`)

TS types and command wrappers are generated from the Rust command signatures by `tauri-typegen`
(`cargo tauri-typegen generate` / `just gen`) — **never hand-edit files in `src/generated/`**; add
or change a `#[tauri::command]` in `src-tauri/src/app/commands.rs` and regenerate instead.

### Frontend (`src/`)

React + Vite + Mantine UI. `WorkflowContext` (`src/components/contexts/WorkflowContext.tsx`) holds
cross-panel state shared by the four workflow panels (`components/workflow/*`): the
uploaded/active `DatasetMetadata` and a `GlobalBusyState` enum (`idle | loading-data | filtering |
selecting | validating`) that panels use to disable/enable each other as the pipeline advances.
Each panel calls into `src/generated` command wrappers, which invoke the matching Rust command.
`SelectionPanel/` has two sub-panels (`OpsPanel`, `GaPanel`) for the two selection strategies; the
GA panel additionally listens on a Tauri `Channel` for `GaProgressEvent`s to render live progress
and exposes an abort action.

### Tauri config

Capabilities/permissions are declared in `src-tauri/capabilities/default.json` — currently just
`core:default`, `opener:default`, `dialog:default`, and the broad, unscoped `fs:default`.
`tauri-plugin-persisted-scope` is also registered as a plugin in `lib.rs` (to remember picked
file/folder access across restarts) but isn't itself listed there as a capability permission. App
metadata and window config live in `tauri.conf.json`: CSP is disabled (`app.security.csp: null`),
there's a system tray icon (`app.trayIcon`), and `bundle.targets` is
`["appimage", "deb", "nsis"]` — Linux and Windows only, no macOS target configured. Version numbers
must stay in sync across `tauri.conf.json`, `package.json`, and `Cargo.toml` — use `just bump`
rather than editing by hand.

Tauri's documentation is available for you at @.agents/docs/tauri/llms-full.md .

## MCP servers and skills

This project declares four MCP servers in `.mcp.json`: `tauri-docs` (remote Tauri docs), `mantine`
(Mantine component docs — useful given the frontend is Mantine-based), `tauri-mcp-server` (can drive
and screenshot the running Tauri app, e.g. for testing UI changes), and `polars-mcp`.

`.agents/skills/` also bundles ~50 Tauri Claude Code skills (`tauri-app-*` covering individual
plugins like `dialog`, `fs`, `updater`, `sql`, etc., plus `tauri-scaffold`, `tauri-security`,
`tauri-ipc`, `tauri-config`, and `tauri` itself as a router/index into the rest) and
`tauri-mcp-cli`, which wraps `tauri-mcp-server` for driving the app from terminal commands. Prefer
these over ad-hoc web searches when working on plugin integration or Tauri configuration.

## Known Issues

Observed during a documentation pass; listed here as facts about the current state, not fixed as
part of that pass.

- **Validation is unwired.** `validation/*` is fully implemented and unit-tested, but there is no
  `#[tauri::command]` for it, it's absent from `invoke_handler!` in `lib.rs`, and
  `ValidationPanel.tsx` only ever shows a hardcoded mock result.
- **`app/error.rs`'s `QsarError` is dead code.** Every real command path builds ad-hoc `String`
  errors instead of using it.
- **Filter → Select ordering isn't enforced by the UI.** `SelectionPanel` unlocks as soon as a
  dataset is loaded (`activeDataset` truthy), not after filtering; calling OPS/GA before
  `apply_filter_cmd` fails server-side with `"No filter result"` from `materialize_last_x`.
- **The Autoscale checkbox has no backend effect.** `FilterPipeline::run` always normalizes
  columns before computing the variance/correlation/collinearity filters, regardless of
  `FilterConfig.autoscale`.
- **`GAConfig.cv_folds`/`ridge_lambda` are unused.** Despite the module doc comment describing the
  raw score as "the k-fold CV Q²", `core/ga/fitness.rs::validation_score` always scores candidates
  with `loo_q2_rmsecv` (leave-one-out); `cv_folds` only appears in a `debug_assert!`.
- **`CVConfig.enable_parallel` is unused** — set at every call site and in every test, but never
  read by `loo_cv`/`kfold_cv`/`lno_cv`.
- **`core::ga::events::GA_PROGRESS_EVENT` is an unused constant** — GA progress is delivered over a
  typed Tauri `Channel`, which doesn't need (and doesn't use) a named event string.
- **`core/stats.rs` is dead code**, distinct from (and not to be confused with) `utils/stats.rs`,
  which is what filter/ops/GA/validation actually use.
- **Unused Cargo dependencies**: `reqwest`, `chrono`, `uuid`, and `tauri-plugin-shell` are declared
  in `Cargo.toml` but not referenced (or, for `tauri-plugin-shell`, not registered as a plugin)
  anywhere in `src-tauri/src/`.
- **Dead frontend code**: `src/generated/events.ts` (a hand-maintained-looking duplicate of the
  typegen-generated `GaProgressEvent` type, imported nowhere) and
  `src/components/workflow/WorkflowTimeline.tsx` (defined, never imported).
- **Stale org URLs**: `tauri.conf.json`'s `bundle.homepage` and the release notes in
  `.github/workflows/tauri-release.yml` point at `github.com/hellmrf/qsarmodeling`, even though
  `bundle.publisher` is `"LACC-UFMG"`.
- **License story is unresolved.** `tauri.conf.json`'s `bundle.copyright` reads "Copyright © 2026
  Heliton Martins. All rights reserved." while the repository's `LICENSE` file is GPLv3.
- **CI only runs `cargo test`** (`.github/workflows/run-tests.yml`) — no `clippy`,
  `cargo fmt --check`, or frontend build/typecheck step.
