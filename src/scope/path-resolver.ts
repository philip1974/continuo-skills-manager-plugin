// Resolve user and project skill roots through Plan 05 SDK surfaces.
//
// v0.1.1 (post-topic-05): Project scope is no longer manually configured
// via dataStore — it auto-resolves from Continuo's workspace.getRoot()
// (Continuo SDK 0.2.2+). Required: workspace is git-backed (git rev-parse
// --git-dir succeeds). When no workspace open or not git-backed, returns
// null and PanelMain disables Project install buttons.
//
// PROJECT_SCOPE_CWD_KEY still exported for back-compat: legacy dataStore
// entries are silently ignored (effective workspace wins) but the key
// const is preserved to avoid breaking any test/setting that references it.

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
  const root = await app.workspace.getRoot();
  if (!root) return null;

  try {
    const result = await execStreamCollect(app, 'git', ['rev-parse', '--git-dir'], {
      cwd: root,
    });
    if (result.exitCode !== 0) return null;
  } catch {
    return null;
  }

  return join(root, '.claude', 'skills');
}

export { PROJECT_SCOPE_CWD_KEY };
