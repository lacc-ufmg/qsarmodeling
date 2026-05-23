_default:
    @{{ quote(just_executable()) }} --list --justfile={{ quote(justfile()) }}

dev:
    turbo run dev

alias b := build
build:
    turbo run "desktop#build"

[working-directory("apps/desktop")]
vitedev:
    pnpm vite

[working-directory("apps/desktop")]
tauridev:
    pnpm run tauri dev
