import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { treeHashFromGit } from './safe-fs';

const EXPECTED_HEAD_TREE_HASH =
  'f99f55f04961aa213fff09d64911a35a838cf8c4f93e0423b730af0f2dc178fd';

async function fixtureExists(path: string): Promise<boolean> {
  const { access } = await import('node:fs/promises');
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function generateFixture(): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  execFileSync('bash', ['tools/generate-fixture-bare.sh'], { stdio: 'inherit' });
}

function makeApp(spawn: typeof import('node:child_process').spawn) {
  return {
    shell: {
      execStream: (cmd: string, args: string[], opts?: { cwd?: string }) => {
        const proc = spawn(cmd, args, { cwd: opts?.cwd });
        const done = new Promise<{
          exitCode: number | null;
          signal: NodeJS.Signals | null;
        }>((resolveDone) => {
          proc.on('exit', (exitCode, signal) => resolveDone({ exitCode, signal }));
        });
        const chunks = (async function* () {
          for await (const chunk of proc.stdout) {
            yield { stream: 'stdout' as const, chunk: new Uint8Array(chunk) };
          }
          for await (const chunk of proc.stderr) {
            yield { stream: 'stderr' as const, chunk: new Uint8Array(chunk) };
          }
        })();
        return { chunks, done };
      },
    },
    fs: {
      readGitBlob: async (repoDir: string, sha: string) => {
        const proc = spawn('git', ['cat-file', 'blob', sha], { cwd: repoDir });
        const exit = new Promise<number | null>((resolveExit) => {
          proc.on('exit', (code) => resolveExit(code));
        });
        const stdout: Uint8Array[] = [];
        const stderr: Uint8Array[] = [];
        for await (const chunk of proc.stdout) stdout.push(new Uint8Array(chunk));
        for await (const chunk of proc.stderr) stderr.push(new Uint8Array(chunk));
        const exitCode = await exit;
        if (exitCode !== 0) {
          throw new Error(
            `git cat-file failed: ${Buffer.concat(stderr).toString('utf-8')}`,
          );
        }
        return Buffer.concat(stdout);
      },
    },
  } as never;
}

describe('treeHashFromGit cross-OS determinism (T-cross-os)', () => {
  const fixturePath = resolve(process.cwd(), '__fixtures__/skill-bare.git');

  beforeAll(async () => {
    if (!(await fixtureExists(fixturePath))) {
      await generateFixture();
    }
  });

  it('hash is stable for HEAD of skill-bare.git', async () => {
    if (!(await fixtureExists(fixturePath))) {
      console.warn('[T-cross-os] fixture absent, skipping');
      return;
    }

    const { spawn } = await import('node:child_process');
    const hash = await treeHashFromGit(makeApp(spawn), fixturePath, 'HEAD', '');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(EXPECTED_HEAD_TREE_HASH);
  });
});
