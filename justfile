_default:
    @{{ quote(just_executable()) }} --list --justfile={{ quote(justfile()) }}


dev:
    pnpm run dev
alias tauridev := dev
alias td := dev


build:
    pnpm run build
alias b := build


vitedev:
    pnpm vite


# Usage: just bump <major|minor|patch> [MESSAGE]
[arg('notag', long="notag", value="notag", help="Don't create a git tag for the old version.")]
bump level message="" notag="":
    #!/usr/bin/env bash
    set -euo pipefail

    LEVEL="{{ level }}"
    MESSAGE="{{ message }}"

    # ── 1. Validate level ────────────────────────────────────────────────────
    if [[ "$LEVEL" != "major" && "$LEVEL" != "minor" && "$LEVEL" != "patch" ]]; then
        echo "❌  Invalid level: '$LEVEL'. Must be major, minor, or patch."
        exit 1
    fi

    # ── 2. Cleanliness checks ────────────────────────────────────────────────
    WATCHED_FILES=(
        "src-tauri/tauri.conf.json"
        "package.json"
        "pnpm-lock.yaml"
        "Cargo.toml"
        "Cargo.lock"
    )

    # Nothing may be staged
    if ! git diff --cached --quiet; then
        echo "❌  There are staged changes. Unstage them before bumping."
        exit 1
    fi

    # Watched files must have no uncommitted changes
    for f in "${WATCHED_FILES[@]}"; do
        if ! git diff --quiet -- "$f" 2>/dev/null; then
            echo "❌  '$f' has uncommitted changes. Commit or stash them first."
            exit 1
        fi
    done

    echo "✅  Working tree is clean."

    # ── 3. Read current version ──────────────────────────────────────────────
    OLD_VERSION=$(jq -r '.version' src-tauri/tauri.conf.json)

    IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$OLD_VERSION"

    # ── 4. Calculate new version ─────────────────────────────────────────────
    case "$LEVEL" in
        major) NEW_VERSION="$((V_MAJOR + 1)).0.0" ;;
        minor) NEW_VERSION="${V_MAJOR}.$((V_MINOR + 1)).0" ;;
        patch) NEW_VERSION="${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))" ;;
    esac

    # ── 5. Confirm ───────────────────────────────────────────────────────────
    echo ""
    echo "  📦  v${OLD_VERSION}  →  v${NEW_VERSION}  (${LEVEL})"
    [[ -n "$MESSAGE" ]] && echo "  💬  ${MESSAGE}"
    echo ""
    read -rp "Proceed? [y/N] " CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi

    # ── 6. Tag OLD_VERSION ───────────────────────────────────────────────────
    if [[ -n "{{ notag }}" ]]; then
        echo "⚠️   Skipping git tag for v${OLD_VERSION} (notag flag set)."
    else
        TAG_MSG="${MESSAGE:-v${OLD_VERSION}}"
        git tag -a "v${OLD_VERSION}" -m "$TAG_MSG" && \
        echo "🏷️   Tagged v${OLD_VERSION}" || \
        echo "⚠️   Failed to tag v${OLD_VERSION}. Skipping."
    fi

    # ── 7. Update version in all files ───────────────────────────────────────

    # tauri.conf.json  (jq is the source of truth)
    jq --arg v "$NEW_VERSION" '.version = $v' \
        src-tauri/tauri.conf.json > /tmp/_tauri.conf.json \
        && mv /tmp/_tauri.conf.json src-tauri/tauri.conf.json

    # package.json
    jq --arg v "$NEW_VERSION" '.version = $v' \
        package.json > /tmp/_package.json \
        && mv /tmp/_package.json package.json

    # Cargo.toml — only lines that start with `version = "..."` (package entry)
    # The .bak suffix makes this portable across macOS and Linux.
    sed -i.bak \
        "s/^version = \"${OLD_VERSION}\"/version = \"${NEW_VERSION}\"/" \
        Cargo.toml
    rm Cargo.toml.bak

    echo "✅  Version updated in all source files."

    # ── 8. Regenerate lock files ─────────────────────────────────────────────
    echo "🔄  pnpm install..."
    pnpm install

    echo "🔄  cargo generate-lockfile..."
    cargo generate-lockfile

    # ── 9. Commit ────────────────────────────────────────────────────────────
    git add \
        src-tauri/tauri.conf.json \
        package.json \
        Cargo.toml \
        pnpm-lock.yaml \
        Cargo.lock

    git commit -m "🔖 Bump from v${OLD_VERSION} to v${NEW_VERSION}"
    echo "✅  Committed: 🔖 Bump from v${OLD_VERSION} to v${NEW_VERSION}"

    # ── 10. Offer to push ────────────────────────────────────────────────────
    echo ""
    read -rp "Push now? (git push && git push --tags) [y/N] " PUSH_CONFIRM
    if [[ "$PUSH_CONFIRM" == "y" || "$PUSH_CONFIRM" == "Y" ]]; then
        git push && git push --tags
        echo "🚀  Pushed commits and tags."
    else
        echo "Skipped. Run when ready:"
        echo "    git push && git push --tags"
    fi
