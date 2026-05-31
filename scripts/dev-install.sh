#!/usr/bin/env bash
set -euo pipefail

# dev-install.sh - install Skills Manager plugin into Continuo userData/plugins
# (copy mode only; symlink deferred per plan-v3 + plan-v4 Op1 1h pending)

usage() {
  cat <<'EOF'
Usage: scripts/dev-install.sh [--dev | --all] [--uninstall] [--help]

Targets:
  default  Install to ~/Library/Application Support/Continuo/Plugins/<plugin-id>/
           (packaged Continuo userData)
  --dev    Install to ~/Library/Application Support/Continuo Dev/Plugins/<plugin-id>/
           (`pnpm dev` userData, "Continuo Dev" space-suffixed)
  --all    Install to BOTH packaged + dev paths in one shot

Options:
  --uninstall  Remove the target plugin directory(ies) instead of installing
  --help       Show this help

Note: target dir name is the plugin id from manifest.json (e.g.
com.continuo.skills-manager), not the short alias — Continuo PluginManager
scans by id.
EOF
}

MODE=packaged  # packaged | dev | all
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      MODE=dev
      shift
      ;;
    --all)
      MODE=all
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

# Ensure required artifacts exist (when installing)
if [[ "$UNINSTALL" == false ]]; then
  for path in manifest.json dist/main.js README.md; do
    if [[ ! -e "$path" ]]; then
      echo "[skills-manager] ERROR: missing $path (run 'pnpm build' first)" >&2
      exit 1
    fi
  done
fi

install_to_userdata() {
  local label="$1"
  local userdata="$2"
  local target="$userdata/Plugins/$PLUGIN_ID"

  if [[ "$UNINSTALL" == true ]]; then
    if [[ -d "$target" ]]; then
      rm -rf "$target"
      echo "[skills-manager] [$label] uninstalled: $target"
    else
      echo "[skills-manager] [$label] not installed (nothing to remove): $target"
    fi
    return
  fi

  echo "[skills-manager] [$label] Installing to: $target"
  mkdir -p "$(dirname "$target")"
  rm -rf "$target"
  mkdir -p "$target"
  cp manifest.json "$target/"
  cp -r dist "$target/"
  cp README.md "$target/"
  echo "[skills-manager] [$label] installed (copy mode)"
}

PACKAGED_USER_DATA="$HOME/Library/Application Support/Continuo"
DEV_USER_DATA="$HOME/Library/Application Support/Continuo Dev"

case "$MODE" in
  packaged)
    install_to_userdata packaged "$PACKAGED_USER_DATA"
    ;;
  dev)
    install_to_userdata dev "$DEV_USER_DATA"
    ;;
  all)
    install_to_userdata packaged "$PACKAGED_USER_DATA"
    install_to_userdata dev "$DEV_USER_DATA"
    ;;
esac

echo "[skills-manager] restart Continuo (or 다시 로드 in plugin marketplace) to load the plugin"
