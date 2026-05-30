// Business trust helpers. Plugin code should use these wrappers, not app.fs.* directly.

import { createHash } from 'node:crypto';
import {
  basename,
  dirname,
  normalize as pathNormalize,
  sep,
} from 'node:path';
import type { CoPluginApp } from '../types/sdk-shim';
import { execStreamCollect } from '../util/exec-stream-helper';
import { decodeUtf8Strict } from '../util/utf8-validate';

export class ScopeError extends Error {
  readonly code: 'SCOPE_ERROR' = 'SCOPE_ERROR';

  constructor(
    message: string,
    public readonly details?: { target?: string; reason?: string },
  ) {
    super(message);
    this.name = 'ScopeError';
  }
}

export class SymlinkRootRejectedError extends ScopeError {
  constructor(root: string) {
    super(`skills root is a symlink (literal path policy): ${root}`, {
      target: root,
      reason: 'symlink-root',
    });
    this.name = 'SymlinkRootRejectedError';
  }
}

export class DirectoryAssetsNotSupportedError extends ScopeError {
  constructor(
    public readonly entryId: string,
    public readonly extraFiles: string[],
  ) {
    super(
      `directory assets not supported in v0.1 for ${entryId} (found: ${extraFiles
        .slice(0, 3)
        .join(', ')}${extraFiles.length > 3 ? ', ...' : ''})`,
      { reason: 'directory-assets' },
    );
    this.name = 'DirectoryAssetsNotSupportedError';
  }
}

export interface BlobEntry {
  path: string;
  sha: string;
}

export async function assertInsideSkillsRoot(
  app: CoPluginApp,
  target: string,
  root: string,
): Promise<{ canonicalTarget: string }> {
  const rootStat = await app.fs.lstat(root);
  if (rootStat.isSymlink) throw new SymlinkRootRejectedError(root);

  const canonicalTarget = await app.fs.realpath(target);
  const boundaryRoot = pathNormalize(root);
  if (
    canonicalTarget === boundaryRoot ||
    canonicalTarget.startsWith(boundaryRoot + sep)
  ) {
    return { canonicalTarget };
  }

  throw new ScopeError('target outside skills root', {
    target: canonicalTarget,
    reason: 'outside-root',
  });
}

export async function safeRemoveSkill(
  app: CoPluginApp,
  target: string,
  root: string,
): Promise<void> {
  await assertInsideSkillsRoot(app, target, root);
  await app.fs.rm(target, { recursive: true, force: false });
}

export async function safeCopyTreeFromBlobs(
  app: CoPluginApp,
  blobs: BlobEntry[],
  dst: string,
  repoDir: string,
  opts: { entryId: string },
): Promise<void> {
  const allowed = blobs.filter((blob) => basename(blob.path) === 'SKILL.md');
  const extra = blobs.filter((blob) => basename(blob.path) !== 'SKILL.md');
  if (extra.length > 0) {
    throw new DirectoryAssetsNotSupportedError(
      opts.entryId,
      extra.map((blob) => blob.path),
    );
  }
  if (allowed.length === 0) {
    throw new ScopeError(`no SKILL.md in blobs for ${opts.entryId}`);
  }

  for (const blob of allowed) {
    const bytes = await app.fs.readGitBlob(repoDir, blob.sha);
    const text = decodeUtf8Strict(bytes);
    const fullPath = pathNormalize(dst + sep + blob.path);
    const parentDir = dirname(fullPath);
    await app.fs.mkdir(parentDir, { recursive: true });
    await app.fs.writeFile(fullPath, text);
  }
}

export async function safeAtomicReplace(
  app: CoPluginApp,
  staging: string,
  final: string,
  opts?: { overwrite?: boolean },
): Promise<void> {
  await app.fs.atomicReplaceWithinScope(staging, final, opts);
}

export async function treeHashFromGit(
  app: CoPluginApp,
  repoDir: string,
  ref: string,
  subpath: string,
): Promise<string> {
  const ls = await execStreamCollect(
    app,
    'git',
    ['ls-tree', '-r', ref, subpath || '.'],
    { cwd: repoDir },
  );
  if (ls.exitCode !== 0) {
    throw new Error(`git ls-tree failed: ${ls.stderr.toString('utf-8')}`);
  }

  const blobs: { sha: string; path: string }[] = [];
  const lines = ls.stdout
    .toString('utf-8')
    .trim()
    .split('\n')
    .filter((line) => line);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(blob|tree)\s+([0-9a-f]+)\s+(.+)$/);
    const kind = match?.[2];
    const sha = match?.[3];
    const path = match?.[4];
    if (kind === 'blob' && sha && path && basename(path) === 'SKILL.md') {
      blobs.push({ sha, path });
    }
  }

  blobs.sort((a, b) => a.path.localeCompare(b.path));
  const hasher = createHash('sha256');
  for (const blob of blobs) {
    const bytes = await app.fs.readGitBlob(repoDir, blob.sha);
    decodeUtf8Strict(bytes);
    hasher.update(Buffer.from(blob.path, 'utf-8'));
    hasher.update(Buffer.from([0]));
    hasher.update(bytes);
    hasher.update(Buffer.from([0]));
  }
  return hasher.digest('hex');
}
