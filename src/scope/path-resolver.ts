// Resolve user and project skill roots through Plan 05 SDK surfaces.

import type { CoPluginApp } from '../types/sdk-shim';
import { execStreamCollect } from '../util/exec-stream-helper';
import { join } from '../util/path-polyfill';

const PROJECT_SCOPE_CWD_KEY = 'config:project-scope-cwd';

export async function resolveUserScope(app: CoPluginApp): Promise<string> {
  const home = await app.fs.userHome();
  return join(home, '.claude', 'skills');
}

export async function resolveProjectScope(
  app: CoPluginApp,
): Promise<string | null> {
  const stored = await app.dataStore.load();
  const cwd = stored[PROJECT_SCOPE_CWD_KEY];
  if (typeof cwd !== 'string' || !cwd) return null;

  try {
    const result = await execStreamCollect(app, 'git', ['rev-parse', '--git-dir'], {
      cwd,
    });
    if (result.exitCode !== 0) return null;
  } catch {
    return null;
  }

  return join(cwd, '.claude', 'skills');
}

export async function setProjectScopeCwd(
  app: CoPluginApp,
  cwd: string | null,
): Promise<void> {
  const data = await app.dataStore.load();
  if (cwd === null) {
    delete data[PROJECT_SCOPE_CWD_KEY];
  } else {
    data[PROJECT_SCOPE_CWD_KEY] = cwd;
  }
  await app.dataStore.save(data);
}

export { PROJECT_SCOPE_CWD_KEY };
