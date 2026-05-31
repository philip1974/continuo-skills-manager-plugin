// Collect Plan 05 app.shell.execStream chunks and completion into one result.
//
// Plugin runs in sandboxed renderer — no Node Buffer / NodeJS.Signals globals.
// Use Uint8Array + concatBytes (web-crypto-helpers) for Web-API compat.

import type { CoPluginApp } from '../types/sdk-shim';
import { concatBytes } from './web-crypto-helpers';

export interface ExecResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitCode: number | null;
  signal: string | null;
}

export async function execStreamCollect(
  app: CoPluginApp,
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string },
): Promise<ExecResult> {
  const { chunks, done } = app.shell.execStream(cmd, args, opts);
  const stdoutParts: Uint8Array[] = [];
  const stderrParts: Uint8Array[] = [];

  for await (const chunk of chunks) {
    if (chunk.stream === 'stdout') stdoutParts.push(chunk.chunk);
    else stderrParts.push(chunk.chunk);
  }

  const exit = await done;
  return {
    stdout: concatBytes(stdoutParts),
    stderr: concatBytes(stderrParts),
    exitCode: exit.exitCode,
    signal: exit.signal,
  };
}
