#!/usr/bin/env bash
set -euo pipefail

# dev-install.sh - install Skills Manager plugin into Continuo userData/plugins
# (copy mode only; symlink deferred per plan-v3 + plan-v4 Op1 1h pending)

usage() {
  cat <<'EOF'
Usage: scripts/dev-install.sh [--dev] [--uninstall] [--help]

Modes:
  default  Install to ~/Library/Application Support/Continuo/Plugins/<plugin-id>/
  --dev    Install to ~/Library/Application Support/Continuo Dev/Plugins/<plugin-id>/

Options:
  --uninstall  Remove the target plugin directory instead of installing
  --help       Show this help

Note: target dir name is the plugin id from manifest.json (e.g. com.continuo.skills-manager),
not the short alias — Continuo PluginManager scans by id.
EOF
}

DEV_MODE=false
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      DEV_MODE=true
      shift
      ;;
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[skills-manager] ERROR: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$DEV_MODE" == true ]]; then
  USER_DATA="$HOME/Library/Application Support/Continuo Dev"
else
  USER_DATA="$HOME/Library/Application Support/Continuo"
fi

# Read plugin id from manifest.json (Continuo PluginManager scans by id, not alias).
if [[ ! -f manifest.json ]]; then
  echo "[skills-manager] ERROR: manifest.json not found (run from repo root)" >&2
  exit 1
fi
PLUGIN_ID=$(node -p "require('./manifest.json').id" 2>/dev/null)
if [[ -z "$PLUGIN_ID" || "$PLUGIN_ID" == "undefined" ]]; then
  echo "[skills-manager] ERROR: cannot read .id from manifest.json" >&2
  exit 1
fi
TARGET="$USER_DATA/Plugins/$PLUGIN_ID"

echo "[skills-manager] Installing to: $TARGET"

if [[ "$UNINSTALL" == true ]]; then
  if [[ -d "$TARGET" ]]; then
    rm -rf "$TARGET"
    echo "[skills-manager] uninstalled: $TARGET"
  else
    echo "[skills-manager] not installed (nothing to remove): $TARGET"
  fi
  exit 0
fi

# Ensure required artifacts exist
for path in manifest.json dist/main.js README.md; do
  if [[ ! -e "$path" ]]; then
    echo "[skills-manager] ERROR: missing $path (run 'pnpm build' first)" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$TARGET")"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp manifest.json "$TARGET/"
cp -r dist "$TARGET/"
cp README.md "$TARGET/"

echo "[skills-manager] installed (copy mode): $TARGET"
echo "[skills-manager] contents:"
ls -la "$TARGET"
echo "[skills-manager] restart Continuo to load the plugin"
