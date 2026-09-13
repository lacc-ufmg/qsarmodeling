# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

QSAR Kit is a Tauri v2 desktop app (Rust backend + React/Vite frontend) for building and
validating QSAR (Quantitative Structure-Activity Relationship) predictive models from chemical
descriptor data. The user-facing workflow has four steps, each backed by a Tauri command and a
matching React panel: **Load data → Filter descriptors → Select variables (OPS or GA) → Validate
model**.

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

- Run a single Rust test: `cargo test <test_name>` (or `cargo test -p qsarmodeling_lib <test_name>`
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

- **`app/`** — the Tauri-facing layer. `commands.rs` declares every `#[tauri::command]` (thin
  wrappers that delegate to `SessionState`); `session.rs` holds `SessionState`, a
  `Mutex`-protected struct that is the single source of truth for the *current* dataset, the
  computed `FilterPipeline`, and the last filter result — the frontend does not pass large
  matrices back and forth, it just references this server-side session. `error.rs` defines
  `QsarError`/`Result` used internally (commands themselves return `Result<T, String>` across the
  IPC boundary).
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
  - `pls.rs`, `stats.rs` — shared PLS1 fitting and statistics helpers used across filter/ops/GA.
- **`validation/`** — post-selection model validation: `loo.rs` (leave-one-out), `lno.rs`
  (leave-N-out), `kfold.rs`, `yrand.rs` (Y-randomization), `metrics.rs` (Q², RMSECV, R², etc.,
  shared by all validation methods). These operate on an already-selected feature subset.

Data flows one-way through these stages: `loader` → `filter` (cached pipeline) → `ops`/`ga`
(reads the *filtered* matrix via `SessionState::materialize_last_x`) → `validation`. Each stage's
config/result types derive `Serialize`/`Deserialize` with `#[serde(rename_all = "camelCase")]` so
they cross the IPC boundary cleanly into TypeScript.

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

Capabilities/permissions are declared in `src-tauri/capabilities/default.json`; app metadata and
window config in `src-tauri/tauri.conf.json`. Version numbers must stay in sync across
`tauri.conf.json`, `package.json`, and `Cargo.toml` — use `just bump` rather than editing by hand.
