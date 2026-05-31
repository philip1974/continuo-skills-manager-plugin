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

// Mirror of Continuo main repo PluginFsApi (src/plugins/types.ts:118) + userHome (topic-05).
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

export interface CoPluginApp {
  panels: {
    register(spec: {
      type: string;
      title: string;
      factory: (props: unknown) => unknown;
      titleKey?: string;
    }): { dispose(): void };
  };
  settingTabs: {
    register(spec: {
      id: string;
      title: string;
      render: () => unknown;
      titleKey?: string;
      priority?: number;
    }): { dispose(): void };
  };
  fs: CoPluginAppFs;
  shell: any;
  network: any;
  dataStore: any;
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
