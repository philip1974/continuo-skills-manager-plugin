import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { sep } from '../util/path-polyfill';
import { resolveProjectScope, resolveUserScope } from './path-resolver';

async function* chunks() {
  return;
}

function makeApp(opts?: {
  workspaceRoot?: string | null;
  exitCode?: number;
  execThrows?: boolean;
}): CoPluginApp {
  const root = opts?.workspaceRoot ?? null;
  return {
    fs: {
      userHome: vi.fn(async () => '/Users/test-user'),
    },
    workspace: {
      getRoot: vi.fn(async () => root),
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

  it('returns null when no workspace is open', async () => {
    await expect(resolveProjectScope(makeApp())).resolves.toBeNull();
  });

  it('returns null when workspace is an empty string treated as null', async () => {
    await expect(
      resolveProjectScope(makeApp({ workspaceRoot: null })),
    ).resolves.toBeNull();
  });

  it('returns null when workspace is not a git repo', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ workspaceRoot: '/repo', exitCode: 128 }),
      ),
    ).resolves.toBeNull();
  });

  it('returns project skills path when workspace is a git repo', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ workspaceRoot: '/repo', exitCode: 0 }),
      ),
    ).resolves.toBe(`/repo${sep}.claude${sep}skills`);
  });

  it('returns null when execStream itself throws', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ workspaceRoot: '/missing', execThrows: true }),
      ),
    ).resolves.toBeNull();
  });

  it('returns null when a previously valid workspace stops being a git repo', async () => {
    await expect(
      resolveProjectScope(
        makeApp({ workspaceRoot: '/was-repo', exitCode: 128 }),
      ),
    ).resolves.toBeNull();
  });
});
