// SDK shim for Continuo plugin runtime.
//
// MUST NOT be imported by:
// - vitest setup files (src/__tests__/setup-*.ts)
// - Any code path that runs before globalThis.co is assembled.
//
// At runtime in Continuo, globalThis.co is set by src/main.tsx:42-53 before
// plugins are dynamically imported. In tests, the setupFile injects mock
// globalThis.co before any spec imports this file.
//
// The Proxy below defers globalThis.co resolution to access time, so the
// module evaluation order issue (setup vs spec import) is robust.

// All types below mirror Continuo main repo `src/plugins/types.ts` (and
// PluginDataStore.ts). When Continuo upstream changes a contract, update
// the matching shape here AND bump manifest.minLMVersion if behavior gates
// on it. Topic-05 follow-up Op16.5-16.9 caught 5 drifts that GUI smoke
// surfaced after unit tests passed against the wrong shim shape.
//
// Mirror provenance is enforced two ways:
//   1. `// upstream: <file>:<line>` comments on each block (manual audit).
//   2. `pnpm check:web-compat` static gate (catches Node-only patterns
//      that imply renderer incompat); a follow-up topic should add a
//      shape-diff CI step (compare against Continuo@<minLMVersion>).

// upstream: Continuo src/plugins/types.ts (PathScope)
export interface PathScope {
  readonly path: string;
  readonly mode: 'r' | 'rw';
}

export interface FileEntry {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
}

export interface FsStat {
  readonly size: number;
  readonly mtimeMs: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
}

export interface CoPluginAppFs {
  /** Returns home path string only; does not grant fs access. */
  userHome(): Promise<string>;
  requestScope(scopes: PathScope[]): Promise<'grant' | 'deny'>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<readonly FileEntry[]>;
  stat(path: string): Promise<FsStat>;
  lstat(path: string): Promise<FsStat>;
  realpath(path: string): Promise<string>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rename(src: string, dst: string): Promise<void>;
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  cp(src: string, dst: string, opts?: { recursive?: boolean }): Promise<void>;
  readGitBlob(repoDir: string, sha: string): Promise<Uint8Array>;
  atomicReplaceWithinScope(
    staging: string,
    final: string,
    opts?: { overwrite?: boolean },
  ): Promise<void>;
}

// upstream: Continuo src/plugins/types.ts PluginShellApi (exec + execStream)
// Note: Continuo declares `signal: NodeJS.Signals | null` but plugin renderer
// has no NodeJS ambient type at runtime; narrow to `string | null` here.
// chunk: Uint8Array preserved (plugin's util/exec-stream-helper concats).
export interface CoPluginAppShell {
  exec(
    cmd: string,
    args: readonly string[],
    opts?: {
      cwd?: string;
      env?: Readonly<Record<string, string>>;
      timeoutMs?: number;
      input?: string;
      maxOutputBytes?: number;
    },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    truncated: boolean;
  }>;
  execStream(
    cmd: string,
    args: string[],
    opts?: { timeoutMs?: number; cwd?: string },
  ): {
    chunks: AsyncIterable<{
      stream: 'stdout' | 'stderr';
      chunk: Uint8Array;
    }>;
    done: Promise<{ exitCode: number; signal: string | null }>;
  };
}

// upstream: Continuo src/plugins/types.ts PluginNetworkApi
export interface CoPluginAppNetwork {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// upstream: Continuo src/plugins/PluginDataStore.ts (PluginDataStore interface)
// Raw Continuo shape is `{read(id), write(id, data)}`. Plugin's main.ts
// wraps via makeScopedApp() into `{load(), save(data)}` so downstream
// doesn't thread pluginId. Both shapes flow through `app.dataStore` at
// different lifetimes — declared `any` to allow tsc to pass both without
// refactoring every callsite to a new ScopedPluginApp type.
//
// TODO(follow-up): introduce `ScopedPluginApp = Omit<CoPluginApp, 'dataStore'>
// & {dataStore: {load(): Promise<Record<string, unknown>>; save(data: unknown): Promise<void>}}`
// and have makeScopedApp return that. Downstream consumers typed as
// ScopedPluginApp; CoPluginApp.dataStore here tightened to {read, write}.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CoPluginAppDataStore = any;

export interface CoPluginApp {
  panels: {
    // upstream: Continuo src/plugins/registries/PanelRegistry.ts PanelSpec
    register(spec: {
      type: string;
      title: string;
      factory: (props: unknown) => unknown;
      titleKey?: string;
    }): { dispose(): void };
  };
  settingTabs: {
    // upstream: Continuo src/plugins/registries/SettingTabRegistry.ts SettingTabSpec
    register(spec: {
      id: string;
      title: string;
      render: () => unknown;
      titleKey?: string;
      priority?: number;
    }): { dispose(): void };
  };
  fs: CoPluginAppFs;
  shell: CoPluginAppShell;
  network: CoPluginAppNetwork;
  // Polymorphic at runtime: raw {read, write} from Continuo OR scoped
  // {load, save} from main.ts makeScopedApp wrap. See JSDoc above.
  dataStore: CoPluginAppDataStore;
}

export interface PluginManifest {
  id: string;
  name?: string;
  version?: string;
  main: string;
  permissions?: string[];
  minLMVersion?: string;
  description?: string;
}

declare class PluginBase {
  app: CoPluginApp;
  manifest: PluginManifest;
  constructor(app: CoPluginApp, manifest: PluginManifest);
  onload(): void | Promise<void>;
  onunload?(): void | Promise<void>;
}

type StateUpdater<T> = (value: T | ((previous: T) => T)) => void;

interface CoReactRuntime {
  createElement(...args: any[]): unknown;
  useState<T>(initial: T | (() => T)): [T, StateUpdater<T>];
  useEffect(
    effect: () => void | (() => void),
    dependencies?: readonly unknown[],
  ): void;
  useRef<T>(initial: T | null): { current: T | null };
}

export interface CoSdkGlobal {
  Plugin: typeof PluginBase;
  React: CoReactRuntime;
  z: any;
  PermissionError: new (message: string) => Error;
}

declare global {
  var co: CoSdkGlobal;
}

export const co: CoSdkGlobal = new Proxy({} as CoSdkGlobal, {
  get(_target, prop: string | symbol) {
    const real = (globalThis as { co?: CoSdkGlobal }).co;
    if (!real) {
      throw new Error(
        `sdk-shim: globalThis.co not initialized when accessing co.${String(prop)}`,
      );
    }
    return (real as unknown as Record<string | symbol, unknown>)[prop];
  },
});
