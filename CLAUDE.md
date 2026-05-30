# CLAUDE.md

## Role
You are writing the Continuo Skills Manager plugin.
The plugin manages Claude skill directories through the Continuo plugin SDK.
Treat this repository as untrusted UI and orchestration code until proven otherwise.

## Trust Boundary
The trust boundary is the host application SDK.
Do not bypass it.
Plugin code must use `app.fs.*`, `app.shell.*`, and other Plan 05 scoped APIs.
The plugin must not directly import or call `node:fs`.
The plugin must not directly import or call `node:path`.
The plugin must not directly import or call `node:child_process`.
The plugin must not directly import or call `node:crypto`.
Do not use browser globals as a privilege escape.
Do not depend on ambient `globalThis.api`.
Do not assume a Node process, preload bridge, or Electron main access.

## File Operations
All file access goes through scoped SDK APIs.
The default writable targets are user skills and project skills only.
Any future catalog cache must live under plugin data storage.
Never write to `~/Desktop/Continuo`.
Never write to `~/Desktop/ContinuoWiki`.
Never create `~/Desktop/continuo-skills-catalog` in this operation stream.
Do not use recursive delete APIs such as `fs.rm({ recursive: true })`.
Do not use recursive copy APIs such as `fs.cp({ recursive: true })`.
Do not use cross-directory `fs.renameSync`.
Delete and replace operations need explicit, narrow path validation.
Symlink behavior must be explicit in tests before implementation.

## Network And Shell
Catalog reads are network operations and must be visible in the code path.
The official catalog URL is configured, not invented ad hoc.
Shell execution is a privileged operation.
Use `app.shell.*` only for approved commands.
Do not use shell to mutate skill contents when an SDK file API can do it.
Treat Git URLs, refs, and SHAs as user-controlled input.
Prefer exact commit SHA installs over branch installs.
Fetch-by-SHA support is host-dependent and must stay covered by tests.

## Manifest Rules
`manifest.json` must stay within the Continuo manifest schema.
Do not add extension fields unless the host schema explicitly allows them.
The current schema is not passthrough.
Plugin metadata belongs in plugin data or catalog documents, not manifest extras.

## Security Review
Any PR that changes trust gates requires the `security-review` label.
Any PR that widens permissions requires the `security-review` label.
Any PR that changes install, update, remove, or shell behavior requires security review.
Any PR that changes path normalization requires security review.
Any PR that changes catalog trust or signature semantics requires security review.
Do not weaken a trust gate to make a feature pass.
Fix the feature or document the blocked state.

## Development Flow
Use BDD/TDD for behavior that touches files, catalog entries, trust checks, install state, or UI decisions.
For each production source file under `src/`, add a colocated `.test.ts` or `.test.tsx`.
Keep tests focused on externally visible behavior.
Use fixtures for skill layouts rather than writing into real `~/.claude/skills`.
Fixtures must be deterministic and disposable.
Do not depend on the developer machine's existing skills for tests.

## Commands
Run `pnpm typecheck` before handing off TypeScript changes.
Run `pnpm test` before handing off behavior changes.
Run `pnpm trust-gates` before handing off trust boundary changes.
Run `pnpm fixture:gen` only when intentionally regenerating fixtures.
CI runs on Linux, macOS, and Windows.
Windows does not run the Bash trust gate in the first CI version.

## Code Style
Keep implementation small and explicit.
Prefer typed data shapes over loose objects.
Prefer pure parsing and validation helpers with tests.
Keep React components thin when business rules can live in plain TypeScript.
Avoid broad abstractions before there are two concrete call sites.
Do not add dependencies without a clear reason in the plan.

## UI Rules
The first screen is the manager, not a marketing page.
Show installed skills, catalog candidates, and preview state directly.
SKILL.md preview is required before install or update.
Destructive actions need a clear confirmation path.
User scope and project scope must be visibly distinct.
Never hide trust-relevant details behind decorative UI.

## Documentation
Keep design discussion folded into the dev-loop plan or discovery notes.
Do not leave raw agent transcripts in the repository.
When behavior changes, update docs near the code or in the active plan handoff.
Use exact dates for discovery findings.
