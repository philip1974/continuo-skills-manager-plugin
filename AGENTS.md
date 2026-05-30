# AGENTS.md

## Collaboration Boundary
This repository is the Continuo Skills Manager plugin.
Agents may edit files inside this repository only.
Do not write to `~/Desktop/Continuo`.
Do not write to `~/Desktop/ContinuoWiki`.
Do not create or modify `~/Desktop/continuo-skills-catalog` unless a later operation explicitly says so.
Treat the Continuo main repo as read-only reference material.

## Working Rules
Read existing files before changing them.
Keep edits scoped to the active operation.
Do not perform unrelated cleanup.
Do not revert another agent's changes unless the user explicitly asks.
If local changes exist, work with them and preserve intent.
Do not leave generated scratch files outside ignored locations.
Clean temporary directories before handoff.

## Trust Rules
Plugin code must go through the Continuo SDK trust boundary.
Do not bypass SDK scoped file, shell, network, or storage APIs.
Do not introduce direct host filesystem or process access.
Path handling, install, update, remove, and catalog trust changes require extra scrutiny.
Security-sensitive PRs require the `security-review` label.

## Testing Rules
Prefer BDD/TDD for new behavior.
Every production source file should have a colocated test file.
Use fixtures for skill layout cases.
Never run tests against real user skills as mutable state.
Run `pnpm typecheck` and `pnpm test` before completion when source code changes.
Run `pnpm trust-gates` when trust boundaries change.
Record any command that cannot run and why.

## Transcript Hygiene
Do not commit raw chat transcripts.
Do not commit temporary design dumps.
Fold decisions into `DISCOVERY.md`, a plan document, or code comments only when durable.
Keep final handoffs concise and evidence-based.

## Commits
Do not auto commit.
Do not auto push.
Wait for explicit user instruction before staging.
Use Conventional Commits when committing.
Reference the dev-loop topic in commit bodies when relevant.
Example subject: `feat(skills-manager): add catalog manifest scaffold`.
Example body line: `Refs: topic=03-skills-manager-plugin`.

## Cross OS Constraints
CI targets Ubuntu, macOS, and Windows.
Avoid shell-only assumptions in production code.
Keep path tests portable across POSIX and Windows path syntax.
Bash helper scripts are acceptable for Linux and macOS gates.
Windows trust-gate coverage is deferred until a portable runner is added.
Do not depend on case-sensitive filesystem behavior unless tested.
Do not depend on executable bit behavior without a fallback.

## Handoff
List changed files.
List verification commands and outcomes.
Call out skipped checks directly.
End blocked operations with the exact blocker and no speculative fix.
