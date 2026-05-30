import { createHash } from 'node:crypto';
import { sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { BinaryBlobRejectedError } from '../util/utf8-validate';
import {
  assertInsideSkillsRoot,
  DirectoryAssetsNotSupportedError,
  safeAtomicReplace,
  safeCopyTreeFromBlobs,
  safeRemoveSkill,
  ScopeError,
  SymlinkRootRejectedError,
  treeHashFromGit,
} from './safe-fs';

const encoder = new TextEncoder();

async function* shellChunks(stdout: string, stderr = '') {
  if (stdout) yield { stream: 'stdout' as const, chunk: Buffer.from(stdout) };
  if (stderr) yield { stream: 'stderr' as const, chunk: Buffer.from(stderr) };
}

function stat(isSymlink = false) {
  return {
    size: 0,
    mtimeMs: 0,
    isFile: false,
    isDirectory: !isSymlink,
    isSymlink,
  };
}

function makeApp(opts?: {
  rootSymlink?: boolean;
  realpath?: string;
  blobs?: Record<string, Uint8Array>;
  lsStdout?: string;
  lsStderr?: string;
  lsExitCode?: number;
}): CoPluginApp {
  const blobs = opts?.blobs ?? {};
  return {
    fs: {
      requestScope: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      listDir: vi.fn(),
      stat: vi.fn(),
      lstat: vi.fn(async () => stat(opts?.rootSymlink ?? false)),
      realpath: vi.fn(async () => opts?.realpath ?? '/skills/example'),
      mkdir: vi.fn(),
      rename: vi.fn(),
      rm: vi.fn(),
      cp: vi.fn(),
      readGitBlob: vi.fn(async (_repoDir: string, sha: string) => {
        const value = blobs[sha];
        if (!value) throw new Error(`missing blob ${sha}`);
        return value;
      }),
      atomicReplaceWithinScope: vi.fn(),
    },
    shell: {
      execStream: vi.fn(() => ({
        chunks: shellChunks(opts?.lsStdout ?? '', opts?.lsStderr ?? ''),
        done: Promise.resolve({
          exitCode: opts?.lsExitCode ?? 0,
          signal: null,
        }),
      })),
    },
    network: { fetch: vi.fn() },
    dataStore: { load: vi.fn(), save: vi.fn() },
    panels: { register: vi.fn() },
    settingTabs: { register: vi.fn() },
  } as unknown as CoPluginApp;
}

function expectedHash(files: { path: string; content: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(Buffer.from(file.path, 'utf-8'));
    hash.update(Buffer.from([0]));
    hash.update(file.content);
    hash.update(Buffer.from([0]));
  }
  return hash.digest('hex');
}

describe('assertInsideSkillsRoot', () => {
  it('accepts targets inside the literal skills root', async () => {
    const app = makeApp({ realpath: '/skills/example' });
    await expect(assertInsideSkillsRoot(app, '/skills/example', '/skills')).resolves.toEqual({
      canonicalTarget: '/skills/example',
    });
  });

  it('rejects targets outside the skills root', async () => {
    const app = makeApp({ realpath: '/other/example' });
    await expect(assertInsideSkillsRoot(app, '/other/example', '/skills')).rejects.toThrow(
      ScopeError,
    );
  });

  it('rejects symlink roots', async () => {
    const app = makeApp({ rootSymlink: true });
    await expect(assertInsideSkillsRoot(app, '/skills/example', '/skills')).rejects.toThrow(
      SymlinkRootRejectedError,
    );
    expect(app.fs.realpath).not.toHaveBeenCalled();
  });

  it('allows symlink targets that resolve inside the root', async () => {
    const app = makeApp({ realpath: '/skills/linked' });
    await expect(assertInsideSkillsRoot(app, '/tmp/link', '/skills')).resolves.toEqual({
      canonicalTarget: '/skills/linked',
    });
  });
});

describe('safeRemoveSkill', () => {
  it('removes a skill after scope validation', async () => {
    const app = makeApp({ realpath: '/skills/remove-me' });
    await safeRemoveSkill(app, '/skills/remove-me', '/skills');
    expect(app.fs.rm).toHaveBeenCalledWith('/skills/remove-me', {
      recursive: true,
      force: false,
    });
  });

  it('does not remove outside the skills root', async () => {
    const app = makeApp({ realpath: '/outside/remove-me' });
    await expect(safeRemoveSkill(app, '/outside/remove-me', '/skills')).rejects.toThrow(
      ScopeError,
    );
    expect(app.fs.rm).not.toHaveBeenCalled();
  });
});

describe('safeCopyTreeFromBlobs', () => {
  it('copies SKILL.md blobs only', async () => {
    const app = makeApp({ blobs: { a: encoder.encode('# Skill') } });
    await safeCopyTreeFromBlobs(
      app,
      [{ path: 'SKILL.md', sha: 'a' }],
      '/dst',
      '/repo',
      { entryId: 'entry' },
    );
    expect(app.fs.mkdir).toHaveBeenCalledWith('/dst', { recursive: true });
    expect(app.fs.writeFile).toHaveBeenCalledWith('/dst/SKILL.md', '# Skill');
  });

  it('rejects directory assets in v0.1', async () => {
    const app = makeApp({ blobs: { a: encoder.encode('# Skill') } });
    await expect(
      safeCopyTreeFromBlobs(
        app,
        [
          { path: 'SKILL.md', sha: 'a' },
          { path: 'assets/logo.png', sha: 'b' },
        ],
        '/dst',
        '/repo',
        { entryId: 'entry' },
      ),
    ).rejects.toThrow(DirectoryAssetsNotSupportedError);
    expect(app.fs.readGitBlob).not.toHaveBeenCalled();
  });

  it('rejects empty blob lists', async () => {
    const app = makeApp();
    await expect(
      safeCopyTreeFromBlobs(app, [], '/dst', '/repo', { entryId: 'empty' }),
    ).rejects.toThrow(ScopeError);
  });

  it('rejects binary blobs before writing', async () => {
    const app = makeApp({ blobs: { a: Uint8Array.from([0xff, 0xfe]) } });
    await expect(
      safeCopyTreeFromBlobs(
        app,
        [{ path: 'SKILL.md', sha: 'a' }],
        '/dst',
        '/repo',
        { entryId: 'binary' },
      ),
    ).rejects.toThrow(BinaryBlobRejectedError);
    expect(app.fs.writeFile).not.toHaveBeenCalled();
  });

  it('handles nested SKILL.md paths with platform separators', async () => {
    const app = makeApp({ blobs: { a: encoder.encode('# Nested') } });
    await safeCopyTreeFromBlobs(
      app,
      [{ path: 'nested/SKILL.md', sha: 'a' }],
      '/dst',
      '/repo',
      { entryId: 'nested' },
    );
    expect(app.fs.mkdir).toHaveBeenCalledWith(`/dst${sep}nested`, {
      recursive: true,
    });
    expect(app.fs.writeFile).toHaveBeenCalledWith(
      `/dst${sep}nested${sep}SKILL.md`,
      '# Nested',
    );
  });
});

describe('safeAtomicReplace', () => {
  it('passes through to the scoped SDK atomic replace', async () => {
    const app = makeApp();
    await safeAtomicReplace(app, '/staging', '/final', { overwrite: true });
    expect(app.fs.atomicReplaceWithinScope).toHaveBeenCalledWith('/staging', '/final', {
      overwrite: true,
    });
  });
});

describe('treeHashFromGit', () => {
  it('hashes one SKILL.md blob', async () => {
    const content = encoder.encode('# One');
    const app = makeApp({
      blobs: { a1: content },
      lsStdout: '100644 blob a1\tSKILL.md\n',
    });
    await expect(treeHashFromGit(app, '/repo', 'FETCH_HEAD', '')).resolves.toBe(
      expectedHash([{ path: 'SKILL.md', content }]),
    );
  });

  it('sorts two SKILL.md files before hashing', async () => {
    const alpha = encoder.encode('# Alpha');
    const beta = encoder.encode('# Beta');
    const app = makeApp({
      blobs: { b2: beta, a1: alpha },
      lsStdout: '100644 blob b2\tz/SKILL.md\n100644 blob a1\ta/SKILL.md\n',
    });
    await expect(treeHashFromGit(app, '/repo', 'HEAD', '.')).resolves.toBe(
      expectedHash([
        { path: 'a/SKILL.md', content: alpha },
        { path: 'z/SKILL.md', content: beta },
      ]),
    );
  });

  it('skips tree entries and non-SKILL blobs', async () => {
    const content = encoder.encode('# Keep');
    const app = makeApp({
      blobs: { c3: content },
      lsStdout:
        '040000 tree deadbeef\tsubdir\n100644 blob aaa\tREADME.md\n100644 blob c3\tsubdir/SKILL.md\n',
    });
    await expect(treeHashFromGit(app, '/repo', 'HEAD', 'subdir')).resolves.toBe(
      expectedHash([{ path: 'subdir/SKILL.md', content }]),
    );
  });

  it('throws when git ls-tree fails', async () => {
    const app = makeApp({ lsExitCode: 128, lsStderr: 'bad ref' });
    await expect(treeHashFromGit(app, '/repo', 'bad', '')).rejects.toThrow(
      /git ls-tree failed: bad ref/,
    );
  });
});
