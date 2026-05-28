# Plan 04 Discovery Report

## Continuo 主仓 commit hash (用 git -C ~/Desktop/Continuo rev-parse HEAD)

`83f978c1909bc05d2f65a2e2473feaa66ee4abaf`

Command:

```sh
git -C ~/Desktop/Continuo rev-parse HEAD
```

Output:

```text
83f978c1909bc05d2f65a2e2473feaa66ee4abaf
```

## Discovery 时间戳

`2026-05-28 11:37:57 KST (+0900)`

Command:

```sh
date '+%Y-%m-%d %H:%M:%S %Z (%z)'
```

## A0.1 Plugin SDK 实际形态

- 文件路径（实际找到的）
  - `src/plugins/README.md`
  - `src/plugins/Plugin.ts`
  - `src/plugins/types.ts`
  - `src/plugins/registries/PanelRegistry.ts`
  - `src/plugins/registries/SettingTabRegistry.ts`
  - `src/plugins/scoped-app.ts`
  - `src/plugins/sandbox-sweep.ts`
  - `src/plugins/PluginDataStore.ts`
  - `src/plugins/co-app.ts`
  - `src/plugins/PluginManager.ts`
  - `src/lib/plugins-host.ts`
  - `src/main.tsx`

- 原始 Action 0 命令

```sh
rg -n "abstract class Plugin|registerPanel|addSettingTab|loadData|saveData" \
   ~/Desktop/Continuo/src/plugins/
```

- 实际输出（关键行）

```text
/Users/RiGang/Desktop/Continuo/src/plugins/README.md:29:| `registerPanel(spec)` | A dockview panel component the user / agent can open. |
/Users/RiGang/Desktop/Continuo/src/plugins/README.md:34:| `addSettingTab(spec)` | A whole tab in the Settings modal. |
/Users/RiGang/Desktop/Continuo/src/plugins/README.md:41:Plus persistence helpers `loadData<T>()` / `saveData(data)` ...
/Users/RiGang/Desktop/Continuo/src/plugins/Plugin.ts:21:export abstract class Plugin {
/Users/RiGang/Desktop/Continuo/src/plugins/Plugin.ts:43:  protected registerPanel(spec: PanelSpec): Disposable {
/Users/RiGang/Desktop/Continuo/src/plugins/Plugin.ts:67:  protected async loadData<T = unknown>(): Promise<T | null> {
/Users/RiGang/Desktop/Continuo/src/plugins/Plugin.ts:80:  protected async saveData(data: unknown): Promise<void> {
/Users/RiGang/Desktop/Continuo/src/plugins/Plugin.ts:84:  protected addSettingTab(spec: SettingTabSpec): Disposable {
```

- 导出 API（实际签名）
  - `Plugin` constructor: `constructor(app: CoPluginApp, manifest: PluginManifest)`.
  - `onload(): void | Promise<void>`, optional `onunload(): void | Promise<void>`.
  - `protected registerPanel(spec: PanelSpec): Disposable`.
  - `protected addSettingTab(spec: SettingTabSpec): Disposable`.
  - `protected async loadData<T = unknown>(): Promise<T | null>`.
  - `protected async saveData(data: unknown): Promise<void>`.
  - SDK entry for external plugin code is `globalThis.co`, set in `src/main.tsx` with `Plugin`, `React`, `PermissionError`, and `z`.

- Panel / setting render shapes
  - `PanelSpec`: `{ type: string; factory: (props: unknown) => ReactNode; title: string; titleKey?: string }`.
  - `SettingTabSpec`: `{ id: string; title: string; titleKey?: string; render: () => ReactNode; icon?: ReactNode; priority?: number }`.

- Sandbox / capability facade found statically
  - `CoPluginApp` exposes `fs`, `network`, `shell`, `clipboard`, `permission`, `mcp`.
  - `PluginFsApi` currently exposes only `readFile(path)`, `writeFile(path, content)`, and `listDir(path)`.
  - `PluginShellApi.exec(cmd, args, opts)` exists and is permission-gated by `shell`.
  - `sandboxSweep()` runs only in `import.meta.env.PROD` and removes ambient `fetch`, `navigator.clipboard`, `globalThis.api`, and `window.api` before user plugin import.

- Persistence finding
  - `loadData/saveData` call `this.app.dataStore.read/write(this.manifest.id)`.
  - `src/plugins/co-app.ts` currently wires `dataStore: new InMemoryDataStore()`.
  - `src/plugins/PluginDataStore.ts` says production IPC to `userData/plugins/<id>/data.json` is pending; current default is in-memory.

- 与 Plan 04 §3 Action 1-7 假设的 gap
  - Plan 04 assumes `loadData/saveData` can back catalog cache. Current code indicates non-persistent `InMemoryDataStore`, so cache via `saveData` will not survive app restart unless Continuo adds an IPC-backed data store first.
  - Plan 04 scanner / installer / uninstaller need richer filesystem operations: recursive enumerate, mkdir, remove, rename, staging, stat/lstat/realpath, blob writes. Current plugin `app.fs` facade does not expose these.
  - Plan 04 Action 4 can run git only through `app.shell.exec` with `shell` permission, not direct `child_process` from plugin code.
  - Plan 04's original context says the plugin only needs `registerPanel` / `addSettingTab` / `loadData` / `saveData`; actual implementation will also need at least `fs`, `network`, and `shell` permissions or new Continuo host APIs.
  - Runtime behavior of sandbox, data persistence, and panel rendering was not verified because this Action 0 was constrained to read-only access to `~/Desktop/Continuo`.

## A0.2 sample-plugin 实际形态

- 文件路径（实际找到的）
  - `examples/sample-plugin/README.md`
  - `examples/sample-plugin/main.js`
  - `examples/sample-plugin/manifest.json`

- 原始 Action 0 命令

```sh
ls -la ~/Desktop/Continuo/examples/sample-plugin/
cat ~/Desktop/Continuo/examples/sample-plugin/manifest.json 2>/dev/null
```

- 实际输出（关键行）

```text
total 40
drwxr-xr-x@  5 RiGang  staff   160 May  6 17:39 .
-rw-r--r--@  1 RiGang  staff  2992 May  4 20:37 README.md
-rw-r--r--@  1 RiGang  staff  8547 May  6 17:39 main.js
-rw-r--r--@  1 RiGang  staff   320 May  6 17:39 manifest.json
```

```json
{
  "id": "com.example.sample",
  "name": "Sample Plugin",
  "version": "0.2.0",
  "main": "main.js",
  "description": "演示 LM 插件 9 贡献点 + loadData/saveData + v5 fs/network runtime gating",
  "author": "LayoutMotion",
  "minLMVersion": "0.1.0",
  "permissions": ["fs", "network", "clipboard", "mcp-tools"]
}
```

- sample-plugin API use found statically
  - `const { Plugin, React, PermissionError, z } = globalThis.co`.
  - Uses `React.createElement`, not JSX.
  - Uses `this.addSettingTab(...)`, `this.loadData()`, `this.saveData(...)`.
  - Uses `this.app.fs.listDir('/tmp')` and `this.app.network.fetch(...)`.
  - Registers MCP tool via `this.registerMcpTool(...)`.
  - Does not request or use `shell` permission.

- 与 Plan 04 §3 Action 1-7 假设的 gap
  - sample-plugin exists and is useful as a static reference.
  - It does not exercise `registerPanel`, installer-like file writes, recursive file operations, git CLI, or shell permission.
  - It intentionally exposes an MCP tool for demo; Plan 04 must avoid this contribution point and avoid `mcp-tools` permission.
  - Runtime probe was not run; see A0.6.

## A0.3 manifest schema 实际形态

- 文件路径（实际找到的）
  - `src/plugins/manifest.ts`
  - `src/plugins/types.ts`

- 原始 Action 0 命令

```sh
rg -n "manifestSchema|z\.object" ~/Desktop/Continuo/src/plugins/manifest.ts
```

- 实际输出（关键行）

```text
14:export const ManifestSchema = z.object({
```

- 实际 schema shape

```ts
export const ManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9._-]+$/),
  name: z.string().min(1),
  version: z.string().regex(SEMVER_RE),
  main: z.string().min(1).default('main.js'),
  description: z.string().optional(),
  author: z.string().optional(),
  authorUrl: z.string().url().optional(),
  minLMVersion: z.string().regex(SEMVER_RE).optional(),
  isDesktopOnly: z.boolean().optional(),
  permissions: z.array(z.enum(PERMISSION_KEYS)).optional(),
});
```

- Permission keys discovered
  - `fs`
  - `network`
  - `shell`
  - `clipboard`
  - `mcp-tools`

- 与 Plan 04 §3 Action 1-7 假设的 gap
  - Manifest schema exists at the planned path, but exported name is `ManifestSchema`, not `manifestSchema`.
  - Manifest does not have declarative contribution metadata; contribution points are runtime calls from `main.js`.
  - A Plan 04 plugin manifest will need `permissions`: likely `fs`, `network`, `shell`; it must not include `mcp-tools`.
  - There is no manifest field for trusted fs gates, catalog hashes, or installer policy; those must live inside plugin code / README / review process.

## A0.4 当前用户 skills layout

- 原始 Action 0 命令

```sh
ls -la ~/.claude/skills/ 2>/dev/null
find ~/.claude/skills/ -maxdepth 2 -name 'SKILL.md' -o -name '*.md' 2>/dev/null | head -20
```

- `ls ~/.claude/skills/` 真实输出

```text
total 0
drwxr-xr-x@ 16 RiGang  staff  512 May 18 12:17 .
drwxr-xr-x@ 28 RiGang  staff  896 May 28 11:33 ..
drwxr-xr-x@  3 RiGang  staff   96 May 27 14:07 dl-execute
drwxr-xr-x@  3 RiGang  staff   96 May 11 13:51 dl-integrate
drwxr-xr-x@  3 RiGang  staff   96 May 18 12:20 dl-plan
drwxr-xr-x@  3 RiGang  staff   96 May 27 14:07 dl-red-team
drwxr-xr-x@  3 RiGang  staff   96 May 18 12:20 dl-req
drwxr-xr-x@  3 RiGang  staff   96 May 18 12:18 dl-req-mvp
drwxr-xr-x@  3 RiGang  staff   96 May 12 16:32 dl-verify
drwxr-xr-x@  3 RiGang  staff   96 May  3 13:56 frontend-design
drwxr-xr-x@  3 RiGang  staff   96 May 12 11:40 il-brief
drwxr-xr-x@  3 RiGang  staff   96 May 12 11:41 il-fix
drwxr-xr-x@  3 RiGang  staff   96 May 12 11:40 il-triage
drwxr-xr-x@  3 RiGang  staff   96 May 12 11:42 il-verify
drwxr-xr-x@  5 RiGang  staff  160 Jan 16 15:16 vercel-react-best-practices
drwxr-xr-x@  3 RiGang  staff   96 May  3 13:56 web-design-guidelines
```

- `find` output

```text
/Users/RiGang/.claude/skills/dl-verify/SKILL.md
/Users/RiGang/.claude/skills/dl-red-team/SKILL.md
/Users/RiGang/.claude/skills/dl-execute/SKILL.md
/Users/RiGang/.claude/skills/il-brief/SKILL.md
/Users/RiGang/.claude/skills/dl-plan/SKILL.md
/Users/RiGang/.claude/skills/web-design-guidelines/SKILL.md
/Users/RiGang/.claude/skills/dl-integrate/SKILL.md
/Users/RiGang/.claude/skills/dl-req/SKILL.md
/Users/RiGang/.claude/skills/il-fix/SKILL.md
/Users/RiGang/.claude/skills/il-triage/SKILL.md
/Users/RiGang/.claude/skills/dl-req-mvp/SKILL.md
/Users/RiGang/.claude/skills/frontend-design/SKILL.md
/Users/RiGang/.claude/skills/il-verify/SKILL.md
/Users/RiGang/.claude/skills/vercel-react-best-practices/SKILL.md
/Users/RiGang/.claude/skills/vercel-react-best-practices/AGENTS.md
```

- 用了 单文件 / 目录 / plugin-form 哪几种？
  - `~/.claude/skills/`: directory form only, 14 top-level directories, 0 top-level single-file `*.md`.
  - 14 directories contain `SKILL.md`.
  - One skill directory also contains `AGENTS.md`: `vercel-react-best-practices/AGENTS.md`.
  - Plugin-form skills also exist under `~/.claude/plugins/.../skills/.../SKILL.md`; first 20 hits include official Figma and plugin-dev skills. These are out of Plan 04 v0.1 scope.

- 数量 / 占用 / 命名
  - Directory-form skills: 14.
  - Single-file skills: 0.
  - Naming is lowercase kebab-case in current user skills.
  - Size range: 4K to 248K per top-level skill directory.

```text
4.0K  web-design-guidelines
8.0K  dl-integrate
8.0K  frontend-design
8.0K  il-brief
8.0K  il-fix
8.0K  il-triage
8.0K  il-verify
12K   dl-req
16K   dl-execute
16K   dl-red-team
20K   dl-plan
20K   dl-req-mvp
20K   dl-verify
248K  vercel-react-best-practices
```

## A0.5 Git 与 fs ops 可用性

- 原始 Action 0 命令

```sh
rg -n "child_process|simple-git|isomorphic-git" ~/Desktop/Continuo/src/plugins/
```

- 实际输出（关键行）

```text
/Users/RiGang/Desktop/Continuo/src/plugins/types.ts:103:   * 检 'shell',未授抛 PermissionError。child_process.spawn 后端,
```

- Broader read-only findings
  - No `simple-git` or `isomorphic-git` dependency found in top-level `package.json`.
  - `git` CLI is installed on this machine:

```text
git version 2.50.1 (Apple Git-155)
/usr/bin/git
```

  - Main-process shell backend exists at `electron/main/services/shell.service.ts` and uses `child_process.spawn`.
  - Plugin sandbox exposes this through `app.shell.exec(cmd, args, opts)` gated by `shell` permission.
  - Existing Continuo plugin marketplace installer exists in `electron/main/services/plugins.service.ts` and uses main-process `spawn('git', ...)`, but its current implementation is generic `git clone --depth 1 <url>`, then `fs.cp`; it is not Plan 04's SHA-pinned skills installer.
  - Existing main-process plugin installer is for Continuo plugins under `userData/plugins/<id>/`, not Claude Code skills under `~/.claude/skills/`.

- main 仓是否引入 simple-git / isomorphic-git / child_process？
  - `simple-git`: not found.
  - `isomorphic-git`: not found.
  - `child_process`: yes, main process uses `node:child_process.spawn`; plugin-facing access is via `app.shell.exec` with permission gating.

- Plan 04 Action 4 step 2 走 git CLI（init + fetch --depth 1 + checkout --detach）是否可行？
  - Host machine: likely yes, `git` CLI exists.
  - From a Continuo plugin: only likely via `this.app.shell.exec('git', [...])` after manifest requests `shell` permission and user grants it.
  - Not verified at runtime.
  - Current SDK does not expose streaming process output; `app.shell.exec` is buffered, one-shot, default timeout 30s, default output cap 10MB. Plan 04 should set longer timeout for `git fetch` and classify failures from buffered stderr/stdout.
  - Current plugin `app.fs` lacks `rm`, `mkdir`, `rename`, `stat/lstat`, and recursive copy. Plan 04 cannot implement its trusted installer/uninstaller through current `app.fs` alone.

## A0.6 Runtime probe 结果（或 gap 报告）

- sample-plugin 是否存在？
  - Yes: `~/Desktop/Continuo/examples/sample-plugin/`.

- 能否 npm run dev / 等价启动？
  - Static startup command exists: top-level `package.json` has `"dev": "electron-vite dev"`.
  - I did not run `npm run dev`.
  - Reason: this task explicitly required read-only access to `~/Desktop/Continuo`, and the Plan 04 runtime probe requires modifying sample-plugin `onload` with temporary `console.log` statements. Running the Electron app can also write userData/runtime state. That would violate this Action 0 boundary.

- Runtime probe gaps
  - Panel React factory 真实入口 / args / return shape: not runtime-verified. Static signature is `factory: (props: unknown) => ReactNode`.
  - `loadData/saveData` physical landing path and permissions: not runtime-verified. Static code currently indicates in-memory storage, while docs mention future `userData/plugins/<id>/data.json`.
  - Plugin sandbox boundary for `child_process` / `fetch` / `fs`: not runtime-verified. Static code indicates:
    - `fetch` should be removed in PROD by `sandboxSweep`, while `app.network.fetch` uses a cached raw fetch.
    - `window.api` / `globalThis.api` should be removed in PROD.
    - `app.shell.exec` is the exposed shell path, permission-gated.
    - `app.fs` is permission-gated but has only read/write/list APIs.

## Gap Summary（最重要）

- Plan 02 看起来跑了 / 没跑（判断 + 证据）
  - The current main repo already contains a substantial plugin system: `src/plugins/`, `examples/sample-plugin/`, `examples/mcp-demo-plugin/`, manifest schema, permission gating, settings tab, panel registry, marketplace installer, MCP tool contribution, and plugin docs.
  - Evidence: `src/plugins/README.md` lists 11 contribution points and current key files; `src/main.tsx` initializes `sandboxSweep` and `PluginManager`; `examples/sample-plugin` is present.
  - Therefore, the repo state is not the empty/pre-Plan-02 shape warned about in the prompt. However, I cannot conclude that Plan 02 specifically "ran"; only that many Plan 04 Action 0 assumed paths already exist at commit `83f978c1909bc05d2f65a2e2473feaa66ee4abaf`.

- Plan 04 哪些 Action 在当前主仓状态下根本无法实施
  - Action 3 catalog cache via `loadData/saveData` cannot be implemented as persistent cache under current static code because `coApp.dataStore` is `InMemoryDataStore`.
  - Action 4 / Action 7 trusted install and uninstall cannot be implemented using current plugin `app.fs` alone. The facade does not expose needed primitives: `stat/lstat/realpath`, `mkdir`, `rename`, `rm`, recursive traversal/copy, or blob writes.
  - Action 4 git clone/fetch can only be attempted through `app.shell.exec` with `shell` permission. If Plan 04 forbids shell-mediated filesystem changes but also does not get new host fs APIs, the installer/uninstaller has no safe implementation path as a pure external plugin.
  - Runtime-verified sandbox behavior is unavailable under this Action 0 boundary.

- Plan 04 哪些假设需要 user / claude 调整后才能继续
  - Adjust required manifest permissions: Plan 04 plugin likely needs `fs`, `network`, and `shell`; not just panel/settings/data helpers.
  - Decide whether to extend Continuo SDK before Action 1:
    - Add richer, permission-gated plugin fs APIs for skills-manager use, or
    - Add a dedicated host IPC / service for Claude skills scan/install/uninstall, or
    - Accept shell-based implementation for git and filesystem operations, with reduced trust guarantees.
  - Decide what to do about `loadData/saveData`: either implement IPC-backed `PluginDataStore` in Continuo first, or keep catalog cache in memory / plugin-controlled external files via a new API.
  - Clarify whether a third-party plugin is allowed to write `~/.claude/skills/` through current fs permission model. Current `PluginFsApi` comments say permission-gated, but not path-scoped to skills.
  - Runtime probe remains required before implementation decisions that depend on production sandbox behavior.

- 建议的下一步
  - Do not start Plan 04 Action 1 yet.
  - First choose one of these implementation paths:
    1. Run / complete the Continuo SDK work needed for persistent plugin data and trusted host fs operations, then rerun A0.6 runtime probe.
    2. Change Plan 04 so the skills manager is not a pure third-party plugin, but a small host-supported plugin with dedicated IPC for scan/install/uninstall.
    3. If pushing under current SDK, scope v0.1 down to scanner + catalog preview only; defer installer/uninstaller until SDK support exists.
  - After that decision, rerun a runtime probe in a separate task where writing a temporary probe plugin and launching `npm run dev` are explicitly allowed.
