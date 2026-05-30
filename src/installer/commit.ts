// Final install commit: verify receipt, rehash, stage, then atomic replace.

import { dirname, sep } from 'node:path';
import type { CatalogEntry, ValidationReceipt } from '../types/data';
import type { CoPluginApp } from '../types/sdk-shim';
import {
  safeAtomicReplace,
  safeCopyTreeFromBlobs,
  treeHashFromGit,
  type BlobEntry,
} from '../trust/safe-fs';
import { execStreamCollect } from '../util/exec-stream-helper';
import { assertReceiptFresh, HashMismatchError } from './validate';

export class CommitError extends Error {
  readonly code: 'COMMIT_ERROR' = 'COMMIT_ERROR';

  constructor(
    public readonly stage: 'rehash' | 'staging' | 'replace',
    message: string,
  ) {
    super(`commit ${stage} failed: ${message}`);
    this.name = 'CommitError';
  }
}

export async function commit(
  app: CoPluginApp,
  args: {
    entry: CatalogEntry;
    repoDir: string;
    receipt: ValidationReceipt;
    overwrite: boolean;
  },
): Promise<void> {
  assertReceiptFresh(args.receipt);

  let rehash: string;
  try {
    rehash = await treeHashFromGit(
      app,
      args.repoDir,
      args.entry.sha,
      args.entry.subpath ?? '',
    );
  } catch (err) {
    throw new CommitError('rehash', String(err));
  }
  if (rehash !== args.receipt.approvedHash) {
    throw new HashMismatchError(args.receipt.approvedHash, rehash);
  }

  const ls = await execStreamCollect(
    app,
    'git',
    ['ls-tree', '-r', args.entry.sha, args.entry.subpath ?? '.'],
    { cwd: args.repoDir },
  );
  if (ls.exitCode !== 0) {
    throw new CommitError(
      'staging',
      `git ls-tree failed: ${ls.stderr.toString('utf-8')}`,
    );
  }

  const blobs: BlobEntry[] = [];
  for (const line of ls.stdout
    .toString('utf-8')
    .trim()
    .split('\n')
    .filter((item) => item)) {
    const match = line.match(/^(\d+)\s+(blob|tree)\s+([0-9a-f]+)\s+(.+)$/);
    const kind = match?.[2];
    const sha = match?.[3];
    const path = match?.[4];
    if (kind === 'blob' && sha && path) {
      blobs.push({ path, sha });
    }
  }

  const parent = dirname(args.receipt.finalTarget);
  const idHash = args.entry.id.replace(/[^a-z0-9-]/gi, '');
  const staging = `${parent}${sep}.staging-${idHash}-${Date.now()}`;
  let stagingMade = false;

  try {
    await safeCopyTreeFromBlobs(app, blobs, staging, args.repoDir, {
      entryId: args.entry.id,
    });
    stagingMade = true;
  } catch (err) {
    if (stagingMade) {
      try {
        await app.fs.rm(staging, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure.
      }
    }
    throw new CommitError('staging', String(err));
  }

  try {
    await safeAtomicReplace(app, staging, args.receipt.finalTarget, {
      overwrite: args.overwrite,
    });
  } catch (err) {
    try {
      await app.fs.rm(staging, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failure.
    }
    throw new CommitError('replace', String(err));
  }
}
