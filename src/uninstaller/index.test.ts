import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillRecord } from '../types/data';
import { resolveProjectScope, resolveUserScope } from '../scope/path-resolver';
import { safeRemoveSkill, ScopeError } from '../trust/safe-fs';
import { uninstall, UninstallScopeError } from './index';

vi.mock('../scope/path-resolver', () => ({
  resolveProjectScope: vi.fn(),
  resolveUserScope: vi.fn(),
}));

vi.mock('../trust/safe-fs', async () => {
  const actual = await vi.importActual<typeof import('../trust/safe-fs')>(
    '../trust/safe-fs',
  );
  return {
    ...actual,
    safeRemoveSkill: vi.fn(),
  };
});

const single: SkillRecord = {
  id: 'skill',
  displayName: 'Skill',
  scope: 'user',
  source: 'single-file',
  path: '/user/.claude/skills/skill.md',
};

const directory: SkillRecord = {
  ...single,
  source: 'directory',
  path: '/user/.claude/skills/skill/SKILL.md',
};

describe('uninstall', () => {
  beforeEach(() => {
    vi.mocked(resolveUserScope).mockReset().mockReturnValue('/user/.claude/skills');
    vi.mocked(resolveProjectScope).mockReset().mockResolvedValue('/repo/.claude/skills');
    vi.mocked(safeRemoveSkill).mockReset().mockResolvedValue(undefined);
  });

  it('removes user single-file skill path', async () => {
    await uninstall({} as never, single);
    expect(safeRemoveSkill).toHaveBeenCalledWith(
      {},
      '/user/.claude/skills/skill.md',
      '/user/.claude/skills',
    );
  });

  it('removes user directory skill path by stripping SKILL.md', async () => {
    await uninstall({} as never, directory);
    expect(safeRemoveSkill).toHaveBeenCalledWith(
      {},
      '/user/.claude/skills/skill',
      '/user/.claude/skills',
    );
  });

  it('removes project scope skills when project root resolves', async () => {
    await uninstall({} as never, {
      ...single,
      scope: 'project',
      path: '/repo/.claude/skills/skill.md',
    });
    expect(safeRemoveSkill).toHaveBeenCalledWith(
      {},
      '/repo/.claude/skills/skill.md',
      '/repo/.claude/skills',
    );
  });

  it('throws when project scope root is unavailable', async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue(null);
    await expect(
      uninstall({} as never, { ...single, scope: 'project' }),
    ).rejects.toThrow(UninstallScopeError);
  });

  it('propagates ScopeError from safeRemoveSkill', async () => {
    vi.mocked(safeRemoveSkill).mockRejectedValue(new ScopeError('outside'));
    await expect(uninstall({} as never, single)).rejects.toThrow(ScopeError);
  });
});
