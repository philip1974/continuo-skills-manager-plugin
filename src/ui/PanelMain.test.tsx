// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanScope } from '../scanner';
import { resolveProjectScope, resolveUserScope } from '../scope/path-resolver';
import type { SkillRecord } from '../types/data';
import { uninstall } from '../uninstaller';
import { PanelMain } from './PanelMain';

vi.mock('../scanner', () => ({
  scanScope: vi.fn(),
}));

vi.mock('../scope/path-resolver', () => ({
  resolveUserScope: vi.fn(),
  resolveProjectScope: vi.fn(),
}));

vi.mock('../uninstaller', () => ({
  uninstall: vi.fn(),
}));

const userSkill: SkillRecord = {
  id: 'one',
  displayName: 'One',
  description: 'First skill',
  scope: 'user',
  source: 'single-file',
  path: '/user/one.md',
};

const secondUserSkill: SkillRecord = {
  ...userSkill,
  id: 'two',
  displayName: 'Two',
  description: 'Second skill',
  path: '/user/two.md',
};

function mockApp() {
  return {
    fs: {
      requestScope: vi.fn().mockResolvedValue('grant'),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      getRoot: vi.fn().mockResolvedValue(null),
    },
  } as never;
}

beforeEach(() => {
  vi.mocked(resolveUserScope).mockReset().mockResolvedValue('/user/.claude/skills');
  vi.mocked(resolveProjectScope).mockReset().mockResolvedValue(null);
  vi.mocked(scanScope).mockReset().mockResolvedValue([]);
  vi.mocked(uninstall).mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PanelMain', () => {
  it('disables project section when project cwd is not configured', async () => {
    render(<PanelMain app={mockApp()} />);
    const section = await screen.findByTestId('project-scope-section');
    expect(section.getAttribute('aria-disabled')).toBe('true');
    const msg = await screen.findByTestId('project-disabled-msg');
    expect(msg.textContent ?? '').toContain('Configure Project skills root');
  });

  it('enables project section when project scope resolves', async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue('/repo/.claude/skills');
    render(<PanelMain app={mockApp()} />);
    const section = await screen.findByTestId('project-scope-section');
    await waitFor(() => {
      expect(section.getAttribute('aria-disabled')).toBe('false');
    });
    expect(screen.queryByTestId('project-disabled-msg')).toBeNull();
  });

  it('shows empty user scope copy', async () => {
    render(<PanelMain app={mockApp()} />);
    expect(
      await screen.findByText('No skills installed in User scope.'),
    ).not.toBeNull();
  });

  it('renders user skill rows with description and uninstall button', async () => {
    vi.mocked(scanScope).mockResolvedValue([userSkill, secondUserSkill]);
    render(<PanelMain app={mockApp()} />);
    expect(await screen.findByTestId('skill-row-user-one')).not.toBeNull();
    expect(screen.getByText('One')).not.toBeNull();
    expect(screen.getByText('First skill')).not.toBeNull();
    expect(screen.getByTestId('skill-row-user-two')).not.toBeNull();
    expect(screen.getAllByText('Uninstall')).toHaveLength(2);
  });

  it('shows confirm when uninstall is clicked', async () => {
    vi.mocked(scanScope).mockResolvedValue([userSkill]);
    render(<PanelMain app={mockApp()} />);
    await userEvent.click((await screen.findByText('Uninstall')) as HTMLElement);
    expect(window.confirm).toHaveBeenCalledWith('Uninstall One?');
  });

  it('rescans after successful uninstall', async () => {
    vi.mocked(scanScope).mockResolvedValue([userSkill]);
    render(<PanelMain app={mockApp()} />);
    await userEvent.click((await screen.findByText('Uninstall')) as HTMLElement);
    await waitFor(() => {
      expect(uninstall).toHaveBeenCalledWith(expect.anything(), userSkill);
      expect(scanScope).toHaveBeenCalledTimes(2);
    });
  });

  it('requests scope only once across refreshes (no re-prompt on uninstall)', async () => {
    vi.mocked(scanScope).mockResolvedValue([userSkill]);
    const requestScope = vi.fn().mockResolvedValue('grant');
    const app = {
      fs: { requestScope, mkdir: vi.fn().mockResolvedValue(undefined) },
      workspace: { getRoot: vi.fn().mockResolvedValue(null) },
    } as never;

    render(<PanelMain app={app} />);
    await userEvent.click((await screen.findByText('Uninstall')) as HTMLElement);
    // Uninstall bumps refreshTick → effect re-runs → rescan happens...
    await waitFor(() => {
      expect(scanScope).toHaveBeenCalledTimes(2);
    });
    // ...but the scope grant is reused, not re-requested (host persists it).
    expect(requestScope).toHaveBeenCalledTimes(1);
  });
});
