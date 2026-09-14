## Development environment

### 1. Rust

Install [`rustup`](https://rustup.rs/):

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Tauri system dependencies

Install [Tauri's dependencies](https://v2.tauri.app/start/prerequisites/#system-dependencies).

On Debian/Ubuntu, use:

```sh
sudo apt update -y
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### 3. Node.js

Install [Node.js v24](https://nodejs.org/en/download) directly, or via
[`nvm`](https://github.com/nvm-sh/nvm).

`nvm` lets you use multiple Node.js versions side by side. If you choose to use it,
[install it](https://github.com/nvm-sh/nvm#installing-and-updating) and then run the following in
the repository:

```sh
nvm install --default
nvm use
```

### 4. `pnpm`

```sh
npm i -g pnpm
```

### 5. Just (optional, but recommended)

Install [Just](https://just.systems/):

```sh
cargo install just just-lsp
```

### Recommended IDE

[VS Code](https://code.visualstudio.com/) with the extensions:
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## How to contribute

### Commit messages

The project's git history mostly follows a Gitmoji-style convention: an emoji prefix summarizing
the kind of change, followed by a short description. This is an **observed convention, not a
tool-enforced rule** (there's no commit linting in CI) — follow it where it fits, but it's not a
hard requirement:

| Emoji | Meaning | Example |
|---|---|---|
| ✨ | New feature | `✨ GA: Progress and Abort` |
| 🐛 | Bug fix | `🐛 Fix ga: bug in tests introduced by last commit` |
| ♻️ | Refactor | `♻️ Use modern modules convention` |
| 🔥 | Remove code/files | `🔥 Remove polars` |
| 💄 | Style / UI | `💄 Fix disabled states` |
| 🔖 | Release / version bump | `🔖 Bump from v0.4.3 to v0.4.4` |

Prefix-style messages like `ci: ...`, `ga: ...`, or `ui: ...` also show up in the history and are
fine too — there isn't a single enforced format.

### Branches and pull requests

Work on a feature branch and open a pull request against `main`; there's no formally documented
branch-naming scheme beyond that observed in the history (short, descriptive branch names).

### Before opening a pull request

Run the checks the CI runs, plus formatting (CI itself currently only runs `cargo test` — see
[`CLAUDE.md`](CLAUDE.md#known-issues) — so the extra checks below are recommended practice, not
things a failing CI run will catch for you):

```sh
just check   # cargo check — type-check the Rust backend
just test    # cargo test  — run all Rust tests
just fmt     # cargo fmt   — format Rust code
```

If you changed a `#[tauri::command]` signature, also regenerate the TypeScript bindings
(`just typegen`) and run `pnpm build` to type-check the frontend against them, since there's no
dedicated frontend test runner.
