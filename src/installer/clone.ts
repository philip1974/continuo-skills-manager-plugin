// Clone a catalog Git entry at an immutable SHA through the Plan 05 shell API.

import type { CoPluginApp } from '../types/sdk-shim';
import { execStreamCollect } from '../util/exec-stream-helper';
import { decodeUtf8 } from '../util/web-crypto-helpers';

export class UnsupportedHostError extends Error {
  readonly code = 'UNSUPPORTED_HOST';

  constructor(public readonly host: string) {
    super(
      `Only GitHub immutable SHA catalogs are supported in v0.1; declared host: ${host}`,
    );
    this.name = 'UnsupportedHostError';
  }
}

export class CloneError extends Error {
  readonly code = 'CLONE_ERROR';

  constructor(
    public readonly stage: 'init' | 'fetch' | 'checkout',
    public readonly stderr: string,
  ) {
    super(`git ${stage} failed: ${stderr.trim().split('\n')[0]}`);
    this.name = 'CloneError';
  }
}

const ALLOWED_GIT_HOSTS = ['github.com'];

export async function cloneAtSha(
  app: CoPluginApp,
  args: { gitUrl: string; sha: string; tmpDir: string },
): Promise<{ canonicalDir: string }> {
  const url = new URL(args.gitUrl);
  if (!ALLOWED_GIT_HOSTS.includes(url.hostname)) {
    throw new UnsupportedHostError(url.hostname);
  }

  await app.fs.mkdir(args.tmpDir, { recursive: true });

  const init = await execStreamCollect(app, 'git', ['init', '--quiet'], {
    cwd: args.tmpDir,
  });
  if (init.exitCode !== 0) {
    throw new CloneError('init', decodeUtf8(init.stderr));
  }

  const fetch = await execStreamCollect(
    app,
    'git',
    ['fetch', '--depth', '1', args.gitUrl, args.sha],
    { cwd: args.tmpDir },
  );
  if (fetch.exitCode !== 0) {
    throw new CloneError('fetch', decodeUtf8(fetch.stderr));
  }

  const checkout = await execStreamCollect(
    app,
    'git',
    ['checkout', '--detach', args.sha],
    { cwd: args.tmpDir },
  );
  if (checkout.exitCode !== 0) {
    throw new CloneError('checkout', decodeUtf8(checkout.stderr));
  }

  const canonicalDir = await app.fs.realpath(args.tmpDir);
  return { canonicalDir };
}
