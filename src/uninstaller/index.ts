// Uninstall a skill through scoped safe remove helpers.

import type { SkillRecord } from '../types/data';
import type { CoPluginApp } from '../types/sdk-shim';
import { resolveProjectScope, resolveUserScope } from '../scope/path-resolver';
import { safeRemoveSkill } from '../trust/safe-fs';

export class UninstallScopeError extends Error {
  readonly code = 'UNINSTALL_SCOPE_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'UninstallScopeError';
  }
}

export async function uninstall(
  app: CoPluginApp,
  record: SkillRecord,
): Promise<void> {
  let root: string | null;
  if (record.scope === 'user') {
    root = resolveUserScope();
  } else {
    root = await resolveProjectScope(app);
  }

  if (root === null) {
    throw new UninstallScopeError(`scope ${record.scope} root not available`);
  }

  const target =
    record.source === 'single-file'
      ? record.path
      : record.path.replace(/[\\/]SKILL\.md$/, '');

  await safeRemoveSkill(app, target, root);
}
