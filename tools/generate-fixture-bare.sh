#!/usr/bin/env bash
# Generates deterministic bare git repo at __fixtures__/skill-bare.git.
# Used by treeHashFromGit cross-OS determinism integration test.
set -euo pipefail

FIXTURE_DIR="__fixtures__/skill-bare.git"
WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

export GIT_AUTHOR_NAME="fixture"
export GIT_AUTHOR_EMAIL="fixture@example.invalid"
export GIT_AUTHOR_DATE="2026-01-01T00:00:00Z"
export GIT_COMMITTER_NAME="fixture"
export GIT_COMMITTER_EMAIL="fixture@example.invalid"
export GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"

REPO="$WORK/repo"
mkdir "$REPO"
git -C "$REPO" init -q -b main
git -C "$REPO" config commit.gpgsign false
git -C "$REPO" config core.autocrlf false
git -C "$REPO" config core.eol lf
git -C "$REPO" config core.fileMode false

cat > "$REPO/SKILL.md" <<'EOF1'
---
name: foo
description: Test skill for hash determinism
---

# Foo

Instructions paragraph.
EOF1

git -C "$REPO" add SKILL.md
git -C "$REPO" commit -q -m "v1"
SHA1=$(git -C "$REPO" rev-parse HEAD)

cat >> "$REPO/SKILL.md" <<'EOF2'

## Example

```
foo --help
```
EOF2

git -C "$REPO" add SKILL.md
git -C "$REPO" commit -q -m "v2"
SHA2=$(git -C "$REPO" rev-parse HEAD)

BARE="$WORK/skill-bare.git"
git clone -q --bare "$REPO" "$BARE"

mkdir -p "$(dirname "$FIXTURE_DIR")"
rm -rf "$FIXTURE_DIR"
mv "$BARE" "$FIXTURE_DIR"

echo "$SHA2"
echo "$SHA1"
