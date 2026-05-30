// Collect Plan 05 app.shell.execStream chunks and completion into one result.

import type { CoPluginApp } from '../types/sdk-shim';

export interface ExecResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
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
    stdout: Buffer.concat(stdoutParts),
    stderr: Buffer.concat(stderrParts),
    exitCode: exit.exitCode,
    signal: exit.signal,
  };
}
