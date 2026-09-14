# QSAR Kit

Quantitative Structure-Activity Relationship (QSAR) modeling applies computational chemistry and
machine learning techniques to predict a compound's activity (*e.g.*, biological) from its
chemical structure.

**QSAR Kit** is a tool for building and validating QSAR models in an accessible, user-friendly
way. Given the chemical structures of a set of compounds and their measured activities, it lets
anyone generate a validated predictive model.

> [!NOTE]
> `tauri.conf.json`'s `productName` is "QSAR Modeling" and the Cargo crate/package.json name is
> `qsarmodeling` — both predate the "QSAR Kit" name used in this README and elsewhere. This is a
> known naming inconsistency, described here rather than resolved unilaterally.

## What works today

The app currently implements the first three steps of the pipeline end-to-end (Rust backend +
React UI, wired together):

- **Load data** — CSV descriptor matrix (`X`) + target vector (`y`), or one of three bundled
  example datasets.
- **Filter descriptors** — variance, correlation, and collinearity filters.
- **Select variables** — either OPS (Ordered Predictors Selection) or a genetic algorithm, with
  live progress and abort for the GA.

**Model validation is not yet implemented in the app.** The backend has fully working,
unit-tested cross-validation and Y-randomization code, but nothing wires it up yet — the UI's
Validate step is a mock with a "Coming soon" badge.

For the full step-by-step walkthrough, including callouts about UI/backend gaps in the current
build, see [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md). For architecture and a consolidated
list of known issues, see [`CLAUDE.md`](CLAUDE.md).

## Installation / How to run

Dependencies:

- Node v24
- `rustup`

### Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

1. Install `pnpm`:
```bash
npm i -g pnpm
```
2. Install the Node.js dependencies:
```bash
pnpm install
```
3. Install `rustup`.
4. Run the `dev` script:
```bash
pnpm dev

# equivalent to:
just dev
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for full environment setup (system dependencies for
Tauri, `just`, etc.) and the contribution workflow.

## Roadmap / long-term vision

None of the following exists in the codebase yet — it's the original long-term vision for the
project, kept here as direction rather than a description of current functionality:

- Selecting structures locally (`.mol2`, `.sdf`, ...) or via SMILES.
- Selecting a file or entering target properties directly.
- Orchestrating locally-available quantum chemistry tools (ORCA, PSI4, Gaussian...) to run the
  underlying calculations.
- Generating descriptors with a chosen method, initially LQTAGrid.
- Full end-to-end flow: generate descriptors → filter → select variables → build the complete
  model → run validations → visualize results.

We can't ignore the functionality that already exists in
[QSARModelingPy](https://github.com/hellmrf/QSARModelingPy) and
[HullQSAR](https://github.com/hellmrf/HullQSAR) — but the chance to improve the user experience
motivates evaluating other technology choices for this project going forward, distributed as an
installable (`.exe`, `.AppImage`, `.deb`, and potentially others) built on Tauri (Rust) + React.

## License

This project is licensed under the GNU General Public License v3.0 — see [`LICENSE`](LICENSE).

> [!NOTE]
> `tauri.conf.json`'s `bundle.copyright` currently reads "Copyright © 2026 Heliton Martins. All
> rights reserved.", which doesn't match the GPLv3 license file. Open item, not resolved here.
