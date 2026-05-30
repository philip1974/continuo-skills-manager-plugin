// Validate a cloned entry and issue a short-lived install receipt.

import { createHash, randomBytes } from 'node:crypto';
import type { CatalogEntry, ScopeRoot, ValidationReceipt } from '../types/data';
import type { CoPluginApp } from '../types/sdk-shim';
import { treeHashFromGit } from '../trust/safe-fs';

export class HashMismatchError extends Error {
  readonly code = 'HASH_MISMATCH';

  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `hash mismatch: expected ${expected.slice(0, 16)}... got ${actual.slice(0, 16)}...`,
    );
    this.name = 'HashMismatchError';
  }
}

export class ExpiredReceiptError extends Error {
  readonly code = 'EXPIRED_RECEIPT';

  constructor(public readonly receipt: ValidationReceipt) {
    super(
      `ValidationReceipt expired (issued at ${new Date(
        receipt.expiresAt - 5 * 60 * 1000,
      ).toISOString()}); re-validate via PreviewDrawer`,
    );
    this.name = 'ExpiredReceiptError';
  }
}

const RECEIPT_TTL_MS = 5 * 60 * 1000;

export async function validateAndIssueReceipt(
  app: CoPluginApp,
  args: {
    entry: CatalogEntry;
    repoDir: string;
    scope: ScopeRoot;
    finalTarget: string;
  },
): Promise<ValidationReceipt> {
  const computed = await treeHashFromGit(
    app,
    args.repoDir,
    args.entry.sha,
    args.entry.subpath ?? '',
  );
  if (computed !== args.entry.hash) {
    throw new HashMismatchError(args.entry.hash, computed);
  }

  const fileListHash = createHash('sha256')
    .update(`${args.entry.subpath ?? ''}/SKILL.md`)
    .digest('hex');

  return {
    ref: args.entry.sha,
    sha256: args.entry.hash,
    approvedHash: computed,
    fileListHash,
    scope: args.scope,
    finalTarget: args.finalTarget,
    nonce: randomBytes(16).toString('hex'),
    expiresAt: Date.now() + RECEIPT_TTL_MS,
  };
}

export function assertReceiptFresh(receipt: ValidationReceipt): void {
  if (Date.now() >= receipt.expiresAt) throw new ExpiredReceiptError(receipt);
}

export { RECEIPT_TTL_MS };
