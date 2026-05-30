// Type shim for Plan 05 SDK CoPluginApp shape.
// Runtime is ambient: the host injects this.app to Plugin base instances.

export interface PathScope {
  path: string;
  mode: 'r' | 'rw';
}

export interface PluginFsApi {
  requestScope(scopes: PathScope[]): Promise<'grant' | 'deny'>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<
    { name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }[]
  >;
  stat(path: string): Promise<{
    size: number;
    mtimeMs: number;
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }>;
  lstat(path: string): Promise<{
    size: number;
    mtimeMs: number;
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }>;
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

export interface PluginShellApi {
  execStream(
    cmd: string,
    args: string[],
    opts?: { timeoutMs?: number; cwd?: string },
  ): {
    chunks: AsyncIterable<{ stream: 'stdout' | 'stderr'; chunk: Uint8Array }>;
    done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
  };
}

export interface PluginNetworkApi {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export interface PluginDataStore {
  load(): Promise<Record<string, unknown>>;
  save(data: Record<string, unknown>): Promise<void>;
}

export interface PluginPanelsApi {
  register(spec: { id: string; title: string; component: unknown }): {
    dispose: () => void;
  };
}

export interface PluginSettingTabsApi {
  register(spec: { id: string; title: string; component: unknown }): {
    dispose: () => void;
  };
}

export interface CoPluginApp {
  readonly fs: PluginFsApi;
  readonly shell: PluginShellApi;
  readonly network: PluginNetworkApi;
  readonly dataStore: PluginDataStore;
  readonly panels: PluginPanelsApi;
  readonly settingTabs: PluginSettingTabsApi;
}

export abstract class Plugin {
  abstract readonly app: CoPluginApp;
  abstract onload(): void | Promise<void>;
  onunload?(): void | Promise<void>;
}
