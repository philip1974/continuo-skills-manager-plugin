import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { execStreamCollect } from './exec-stream-helper';

async function* chunks(items: { stream: 'stdout' | 'stderr'; text: string }[]) {
  for (const item of items) {
    yield { stream: item.stream, chunk: Buffer.from(item.text) };
  }
}

function mockApp(
  items: { stream: 'stdout' | 'stderr'; text: string }[],
  exit: { exitCode: number | null; signal: NodeJS.Signals | null },
): CoPluginApp {
  return {
    shell: {
      execStream: vi.fn(() => ({
        chunks: chunks(items),
        done: Promise.resolve(exit),
      })),
    },
  } as unknown as CoPluginApp;
}

describe('execStreamCollect', () => {
  it('collects stdout chunks in order', async () => {
    const app = mockApp(
      [
        { stream: 'stdout', text: 'hello ' },
        { stream: 'stdout', text: 'world' },
      ],
      { exitCode: 0, signal: null },
    );
    const result = await execStreamCollect(app, 'git', ['status']);
    expect(result.stdout.toString()).toBe('hello world');
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('collects stderr separately', async () => {
    const app = mockApp(
      [
        { stream: 'stdout', text: 'ok' },
        { stream: 'stderr', text: 'warn' },
      ],
      { exitCode: 0, signal: null },
    );
    const result = await execStreamCollect(app, 'git', ['fetch']);
    expect(result.stdout.toString()).toBe('ok');
    expect(result.stderr.toString()).toBe('warn');
  });

  it('returns non-zero exit codes', async () => {
    const app = mockApp([{ stream: 'stderr', text: 'fail' }], {
      exitCode: 2,
      signal: null,
    });
    const result = await execStreamCollect(app, 'git', ['bad']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toBe('fail');
  });

  it('returns signal exits', async () => {
    const app = mockApp([], { exitCode: null, signal: 'SIGTERM' });
    const result = await execStreamCollect(app, 'git', ['slow']);
    expect(result.exitCode).toBeNull();
    expect(result.signal).toBe('SIGTERM');
  });

  it('passes command arguments and options through', async () => {
    const app = mockApp([], { exitCode: 0, signal: null });
    await execStreamCollect(app, 'git', ['ls-tree'], {
      cwd: '/repo',
      timeoutMs: 1000,
    });
    expect(app.shell.execStream).toHaveBeenCalledWith('git', ['ls-tree'], {
      cwd: '/repo',
      timeoutMs: 1000,
    });
  });
});
