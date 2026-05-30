import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry, ValidationReceipt } from '../types/data';
import type { CoPluginApp } from '../types/sdk-shim';
import {
  safeAtomicReplace,
  safeCopyTreeFromBlobs,
  treeHashFromGit,
} from '../trust/safe-fs';
import { execStreamCollect } from '../util/exec-stream-helper';
import { ExpiredReceiptError, HashMismatchError } from './validate';
import { commit, CommitError } from './commit';

vi.mock('../trust/safe-fs', () => ({
  safeAtomicReplace: vi.fn(),
  safeCopyTreeFromBlobs: vi.fn(),
  treeHashFromGit: vi.fn(),
}));

vi.mock('../util/exec-stream-helper', () => ({
  execStreamCollect: vi.fn(),
}));

const entry: CatalogEntry = {
  id: 'skill-1',
  name: 'Skill',
  gitUrl: 'https://github.com/philip1974/repo',
  sha: 'a'.repeat(40),
  hash: 'b'.repeat(64),
};

function receipt(expiresAt = Date.now() + 10_000): ValidationReceipt {
  return {
    ref: entry.sha,
    sha256: entry.hash,
    approvedHash: entry.hash,
    fileListHash: 'files',
    scope: 'user',
    finalTarget: '/skills/skill-1',
    nonce: '0'.repeat(32),
    expiresAt,
  };
}

function app(): CoPluginApp {
  return {
    fs: {
      rm: vi.fn(),
    },
  } as unknown as CoPluginApp;
}

function mockLs(exitCode = 0) {
  vi.mocked(execStreamCollect).mockResolvedValue({
    stdout: Buffer.from('100644 blob cccccccccccccccccccccccccccccccccccccccc\tSKILL.md\n'),
    stderr: Buffer.from(exitCode === 0 ? '' : 'bad ref'),
    exitCode,
    signal: null,
  });
}

describe('commit', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(treeHashFromGit).mockReset().mockResolvedValue(entry.hash);
    vi.mocked(safeCopyTreeFromBlobs).mockReset().mockResolvedValue(undefined);
    vi.mocked(safeAtomicReplace).mockReset().mockResolvedValue(undefined);
    vi.mocked(execStreamCollect).mockReset();
    mockLs();
  });

  it('commits when receipt is fresh and rehash matches', async () => {
    const host = app();
    await commit(host, {
      entry,
      repoDir: '/repo',
      receipt: receipt(),
      overwrite: true,
    });
    expect(safeAtomicReplace).toHaveBeenCalledWith(
      host,
      expect.stringContaining('/skills/.staging-skill-1-'),
      '/skills/skill-1',
      { overwrite: true },
    );
  });

  it('rejects expired receipts before filesystem work', async () => {
    const host = app();
    await expect(
      commit(host, {
        entry,
        repoDir: '/repo',
        receipt: receipt(Date.now() - 1),
        overwrite: true,
      }),
    ).rejects.toThrow(ExpiredReceiptError);
    expect(treeHashFromGit).not.toHaveBeenCalled();
    expect(host.fs.rm).not.toHaveBeenCalled();
  });

  it('throws HashMismatchError when rehash differs', async () => {
    vi.mocked(treeHashFromGit).mockResolvedValue('c'.repeat(64));
    await expect(
      commit(app(), { entry, repoDir: '/repo', receipt: receipt(), overwrite: true }),
    ).rejects.toThrow(HashMismatchError);
  });

  it('wraps ls-tree failures as staging CommitError', async () => {
    mockLs(128);
    await expect(
      commit(app(), { entry, repoDir: '/repo', receipt: receipt(), overwrite: true }),
    ).rejects.toMatchObject({ stage: 'staging' });
  });

  it('wraps staging copy failures as staging CommitError', async () => {
    vi.mocked(safeCopyTreeFromBlobs).mockRejectedValue(new Error('copy failed'));
    await expect(
      commit(app(), { entry, repoDir: '/repo', receipt: receipt(), overwrite: true }),
    ).rejects.toThrow(CommitError);
  });

  it('cleans staging when atomic replace fails', async () => {
    const host = app();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T03:05:00Z'));
    vi.mocked(safeAtomicReplace).mockRejectedValue(new Error('replace failed'));
    await expect(
      commit(host, { entry, repoDir: '/repo', receipt: receipt(Date.now() + 1), overwrite: true }),
    ).rejects.toMatchObject({ stage: 'replace' });
    expect(host.fs.rm).toHaveBeenCalledWith('/skills/.staging-skill-1-1780110300000', {
      recursive: true,
      force: true,
    });
    vi.useRealTimers();
  });

  it('passes overwrite false to atomic replace', async () => {
    await commit(app(), {
      entry,
      repoDir: '/repo',
      receipt: receipt(),
      overwrite: false,
    });
    expect(safeAtomicReplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      '/skills/skill-1',
      { overwrite: false },
    );
  });

  it('places staging in the same parent as final target', async () => {
    const finalReceipt = { ...receipt(), finalTarget: '/skills/nested/final' };
    await commit(app(), {
      entry,
      repoDir: '/repo',
      receipt: finalReceipt,
      overwrite: true,
    });
    expect(safeCopyTreeFromBlobs).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.stringContaining('/skills/nested/.staging-skill-1-'),
      '/repo',
      { entryId: 'skill-1' },
    );
  });
});
