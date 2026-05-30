import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { cloneAtSha, CloneError, UnsupportedHostError } from './clone';

type Exit = { exitCode: number | null; stderr?: string };

async function* emptyChunks() {
  return;
}

function makeApp(exits: Exit[]): CoPluginApp {
  const queue = [...exits];
  return {
    fs: {
      mkdir: vi.fn(),
      realpath: vi.fn(async (path: string) => `/real${path}`),
    },
    shell: {
      execStream: vi.fn(() => {
        const next = queue.shift() ?? { exitCode: 0 };
        return {
          chunks: emptyChunks(),
          done: Promise.resolve({
            exitCode: next.exitCode,
            signal: null,
          }),
        };
      }),
    },
  } as unknown as CoPluginApp;
}

describe('cloneAtSha', () => {
  const base = {
    gitUrl: 'https://github.com/philip1974/repo.git',
    sha: 'a'.repeat(40),
    tmpDir: '/tmp/clone',
  };

  it('rejects non-GitHub hosts', async () => {
    await expect(
      cloneAtSha(makeApp([]), { ...base, gitUrl: 'https://codeberg.org/a/b.git' }),
    ).rejects.toThrow(UnsupportedHostError);
  });

  it('rejects raw.githubusercontent.com for git clone', async () => {
    await expect(
      cloneAtSha(makeApp([]), {
        ...base,
        gitUrl: 'https://raw.githubusercontent.com/a/b/main/file',
      }),
    ).rejects.toMatchObject({ host: 'raw.githubusercontent.com' });
  });

  it('reports init failures', async () => {
    await expect(cloneAtSha(makeApp([{ exitCode: 1 }]), base)).rejects.toMatchObject({
      stage: 'init',
    });
  });

  it('reports fetch failures', async () => {
    await expect(
      cloneAtSha(makeApp([{ exitCode: 0 }, { exitCode: 128 }]), base),
    ).rejects.toMatchObject({ stage: 'fetch' });
  });

  it('reports checkout failures', async () => {
    await expect(
      cloneAtSha(
        makeApp([{ exitCode: 0 }, { exitCode: 0 }, { exitCode: 1 }]),
        base,
      ),
    ).rejects.toMatchObject({ stage: 'checkout' });
  });

  it('returns canonical tmp dir on success', async () => {
    await expect(
      cloneAtSha(
        makeApp([{ exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 }]),
        base,
      ),
    ).resolves.toEqual({ canonicalDir: '/real/tmp/clone' });
  });

  it('uses locked v0.1 unsupported host message', async () => {
    const err = new UnsupportedHostError('example.com');
    expect(err.message).toBe(
      'Only GitHub immutable SHA catalogs are supported in v0.1; declared host: example.com',
    );
    expect(err).toBeInstanceOf(Error);
    expect(new CloneError('fetch', 'bad\nmore').message).toBe(
      'git fetch failed: bad',
    );
  });
});
