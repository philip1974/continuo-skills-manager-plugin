// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { execStreamCollect } from './exec-stream-helper';
import { decodeUtf8 } from './web-crypto-helpers';

const encoder = new TextEncoder();

async function* chunks(items: { stream: 'stdout' | 'stderr'; text: string }[]) {
  for (const item of items) {
    yield { stream: item.stream, chunk: encoder.encode(item.text) };
  }
}

function mockApp(
  items: { stream: 'stdout' | 'stderr'; text: string }[],
  exit: { exitCode: number | null; signal: string | null },
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
    expect(decodeUtf8(result.stdout)).toBe('hello world');
    expect(decodeUtf8(result.stderr)).toBe('');
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
    expect(decodeUtf8(result.stdout)).toBe('ok');
    expect(decodeUtf8(result.stderr)).toBe('warn');
  });

  it('returns non-zero exit codes', async () => {
    const app = mockApp([{ stream: 'stderr', text: 'fail' }], {
      exitCode: 2,
      signal: null,
    });
    const result = await execStreamCollect(app, 'git', ['bad']);
    expect(result.exitCode).toBe(2);
    expect(decodeUtf8(result.stderr)).toBe('fail');
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
