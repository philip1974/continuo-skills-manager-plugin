#!/usr/bin/env bash
# AST gate: scan src/ for forbidden Node imports and dangerous fs calls.

set -euo pipefail
cd "$(dirname "$0")/.."

pnpm tsx tools/check-trust-gates-impl.ts
