import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry, ValidationReceipt } from '../types/data';
import { treeHashFromGit } from '../trust/safe-fs';
import {
  assertReceiptFresh,
  ExpiredReceiptError,
  HashMismatchError,
  RECEIPT_TTL_MS,
  validateAndIssueReceipt,
} from './validate';

vi.mock('../trust/safe-fs', () => ({
  treeHashFromGit: vi.fn(),
}));

const entry: CatalogEntry = {
  id: 'skill',
  name: 'Skill',
  gitUrl: 'https://github.com/philip1974/repo',
  sha: 'a'.repeat(40),
  hash: 'b'.repeat(64),
  subpath: 'skills/skill',
};

function receipt(expiresAt: number): ValidationReceipt {
  return {
    ref: entry.sha,
    sha256: entry.hash,
    approvedHash: entry.hash,
    fileListHash: 'file-list',
    scope: 'user',
    finalTarget: '/skills/skill',
    nonce: '0'.repeat(32),
    expiresAt,
  };
}

describe('validateAndIssueReceipt', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(treeHashFromGit).mockReset();
  });

  it('returns a ValidationReceipt when computed hash matches', async () => {
    vi.mocked(treeHashFromGit).mockResolvedValue(entry.hash);
    const result = await validateAndIssueReceipt({} as never, {
      entry,
      repoDir: '/repo',
      scope: 'project',
      finalTarget: '/target',
    });
    expect(result).toMatchObject({
      ref: entry.sha,
      sha256: entry.hash,
      approvedHash: entry.hash,
      scope: 'project',
      finalTarget: '/target',
    });
  });

  it('throws HashMismatchError on mismatch', async () => {
    vi.mocked(treeHashFromGit).mockResolvedValue('c'.repeat(64));
    await expect(
      validateAndIssueReceipt({} as never, {
        entry,
        repoDir: '/repo',
        scope: 'user',
        finalTarget: '/target',
      }),
    ).rejects.toThrow(HashMismatchError);
  });

  it('sets receipt expiry to now plus five minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T03:05:00Z'));
    vi.mocked(treeHashFromGit).mockResolvedValue(entry.hash);
    const result = await validateAndIssueReceipt({} as never, {
      entry,
      repoDir: '/repo',
      scope: 'user',
      finalTarget: '/target',
    });
    expect(result.expiresAt).toBe(Date.now() + RECEIPT_TTL_MS);
    vi.useRealTimers();
  });

  it('issues a 32 character hex nonce', async () => {
    vi.mocked(treeHashFromGit).mockResolvedValue(entry.hash);
    const result = await validateAndIssueReceipt({} as never, {
      entry,
      repoDir: '/repo',
      scope: 'user',
      finalTarget: '/target',
    });
    expect(result.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('uses deterministic fileListHash for the same subpath', async () => {
    vi.mocked(treeHashFromGit).mockResolvedValue(entry.hash);
    const first = await validateAndIssueReceipt({} as never, {
      entry,
      repoDir: '/repo',
      scope: 'user',
      finalTarget: '/target',
    });
    const second = await validateAndIssueReceipt({} as never, {
      entry,
      repoDir: '/repo',
      scope: 'user',
      finalTarget: '/target',
    });
    expect(first.fileListHash).toBe(second.fileListHash);
    expect(first.fileListHash).toBe(
      createHash('sha256').update('skills/skill/SKILL.md').digest('hex'),
    );
  });

  it('accepts fresh receipts', () => {
    expect(() => assertReceiptFresh(receipt(Date.now() + 1))).not.toThrow();
  });

  it('rejects expired receipts', () => {
    expect(() => assertReceiptFresh(receipt(Date.now() - 1))).toThrow(
      ExpiredReceiptError,
    );
  });

  it('hashes empty subpath differently from a set subpath', async () => {
    vi.mocked(treeHashFromGit).mockResolvedValue(entry.hash);
    const withoutSubpath = await validateAndIssueReceipt({} as never, {
      entry: { ...entry, subpath: undefined },
      repoDir: '/repo',
      scope: 'user',
      finalTarget: '/target',
    });
    const withSubpath = await validateAndIssueReceipt({} as never, {
      entry,
      repoDir: '/repo',
      scope: 'user',
      finalTarget: '/target',
    });
    expect(withoutSubpath.fileListHash).not.toBe(withSubpath.fileListHash);
  });
});
