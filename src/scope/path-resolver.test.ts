import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { sep } from '../util/path-polyfill';
import {
  PROJECT_SCOPE_CWD_KEY,
  resolveProjectScope,
  resolveUserScope,
  setProjectScopeCwd,
} from './path-resolver';

async function* chunks() {
  return;
}

function makeApp(opts?: {
  data?: Record<string, unknown>;
  exitCode?: number;
  execThrows?: boolean;
}): CoPluginApp {
  const data = opts?.data ?? {};
  return {
    fs: {
      userHome: vi.fn(async () => '/Users/test-user'),
    },
    dataStore: {
      load: vi.fn(async () => data),
      save: vi.fn(async () => undefined),
    },
    shell: {
      execStream: vi.fn(() => {
        if (opts?.execThrows) throw new Error('cwd missing');
        return {
          chunks: chunks(),
          done: Promise.resolve({
            exitCode: opts?.exitCode ?? 0,
            signal: null,
          }),
        };
      }),
    },
  } as unknown as CoPluginApp;
}

describe('path resolver', () => {
  it('resolves the user scope to an absolute .claude skills path', async () => {
    const userScope = await resolveUserScope(makeApp());
    expect(userScope).toContain(`${sep}.claude${sep}skills`);
    expect(userScope.startsWith(sep)).toBe(true);
  });

  it('returns null when project scope is not configured', async () => {
    await expect(resolveProjectScope(makeApp())).resolves.toBeNull();
  });

  it('returns null when project cwd is an empty string', async () => {
    await expect(
      resolveProjectScope(makeApp({ data: { [PROJECT_SCOPE_CWD_KEY]: '' } })),
    ).resolves.toBeNull();
  });

  it('returns null when configured cwd is not a git repo', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ data: { [PROJECT_SCOPE_CWD_KEY]: '/repo' }, exitCode: 128 }),
      ),
    ).resolves.toBeNull();
  });

  it('returns project skills path when configured cwd is a git repo', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ data: { [PROJECT_SCOPE_CWD_KEY]: '/repo' }, exitCode: 0 }),
      ),
    ).resolves.toBe(`/repo${sep}.claude${sep}skills`);
  });

  it('returns null when execStream itself throws', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ data: { [PROJECT_SCOPE_CWD_KEY]: '/missing' }, execThrows: true }),
      ),
    ).resolves.toBeNull();
  });

  it('sets project scope cwd in DataStore', async () => {
    const app = makeApp({ data: {} });
    await setProjectScopeCwd(app, '/repo');
    expect(app.dataStore.save).toHaveBeenCalledWith({
      [PROJECT_SCOPE_CWD_KEY]: '/repo',
    });
  });

  it('clears project scope cwd from DataStore', async () => {
    const app = makeApp({
      data: { [PROJECT_SCOPE_CWD_KEY]: '/repo', keep: true },
    });
    await setProjectScopeCwd(app, null);
    expect(app.dataStore.save).toHaveBeenCalledWith({ keep: true });
  });

  it('preserves other DataStore keys when setting cwd', async () => {
    const app = makeApp({ data: { keep: 1 } });
    await setProjectScopeCwd(app, '/repo');
    expect(app.dataStore.save).toHaveBeenCalledWith({
      keep: 1,
      [PROJECT_SCOPE_CWD_KEY]: '/repo',
    });
  });

  it('returns null when a configured cwd is no longer a git repo', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ data: { [PROJECT_SCOPE_CWD_KEY]: '/was-repo' }, exitCode: 128 }),
      ),
    ).resolves.toBeNull();
  });
});
