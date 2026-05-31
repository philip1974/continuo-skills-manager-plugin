// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCatalogUrl,
  setUserCatalogUrlOverride,
} from '../catalog/loader';
import { resolveProjectScope } from '../scope/path-resolver';
import { SettingsTab } from './SettingsTab';

vi.mock('../catalog/loader', () => ({
  CATALOG_URL_CONFIG_KEY: 'config:catalog-url',
  getCatalogUrl: vi.fn(),
  setUserCatalogUrlOverride: vi.fn(),
}));

vi.mock('../scope/path-resolver', () => ({
  resolveProjectScope: vi.fn(),
}));

function app(opts?: { workspaceRoot?: string | null }) {
  return {
    workspace: {
      getRoot: vi.fn(async () => opts?.workspaceRoot ?? null),
    },
  } as never;
}

beforeEach(() => {
  vi.mocked(getCatalogUrl)
    .mockReset()
    .mockResolvedValue(
      'https://raw.githubusercontent.com/philip1974/continuo-skills-catalog/main/catalog.json',
    );
  vi.mocked(setUserCatalogUrlOverride).mockReset().mockResolvedValue(undefined);
  vi.mocked(resolveProjectScope).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SettingsTab', () => {
  it('shows placeholder banner when catalog URL contains TBD org', async () => {
    vi.mocked(getCatalogUrl).mockResolvedValue(
      'https://raw.githubusercontent.com/{TBD-org}/continuo-skills-catalog/main/catalog.json',
    );
    render(<SettingsTab app={app()} />);
    expect(await screen.findByTestId('placeholder-banner')).not.toBeNull();
  });

  it('hides placeholder banner for non-placeholder catalog URLs', async () => {
    render(<SettingsTab app={app()} />);
    await screen.findByTestId('catalog-url-input');
    expect(screen.queryByTestId('placeholder-banner')).toBeNull();
  });

  it('saves catalog URL override from input', async () => {
    render(<SettingsTab app={app()} />);
    const input = (await screen.findByTestId(
      'catalog-url-input',
    )) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'https://github.com/philip1974/catalog.json');
    await userEvent.click(screen.getByTestId('save-catalog-url-btn'));
    expect(setUserCatalogUrlOverride).toHaveBeenCalledWith(
      expect.anything(),
      'https://github.com/philip1974/catalog.json',
    );
  });

  it('resets catalog URL override', async () => {
    render(<SettingsTab app={app()} />);
    await userEvent.click(await screen.findByTestId('reset-catalog-url-btn'));
    expect(setUserCatalogUrlOverride).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('shows "no folder open" when workspace root is null', async () => {
    render(<SettingsTab app={app({ workspaceRoot: null })} />);
    const wsLine = await screen.findByTestId('workspace-line');
    expect(wsLine.textContent).toContain('(no folder open)');
  });

  it('shows workspace root when one is open', async () => {
    render(<SettingsTab app={app({ workspaceRoot: '/Users/me/proj' })} />);
    const wsLine = await screen.findByTestId('workspace-line');
    expect(wsLine.textContent).toContain('/Users/me/proj');
  });

  it('shows resolved project skills root when workspace is git-backed', async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue('/Users/me/proj/.claude/skills');
    render(<SettingsTab app={app({ workspaceRoot: '/Users/me/proj' })} />);
    const psr = await screen.findByTestId('project-skills-line');
    await waitFor(() => {
      expect(psr.textContent).toContain('/Users/me/proj/.claude/skills');
    });
  });

  it('shows unavailable hint when workspace is open but not git-backed', async () => {
    vi.mocked(resolveProjectScope).mockResolvedValue(null);
    render(<SettingsTab app={app({ workspaceRoot: '/Users/me/no-git' })} />);
    const psr = await screen.findByTestId('project-skills-line');
    expect(psr.textContent).toContain('unavailable');
  });

  it('shows saved message after a catalog reset', async () => {
    render(<SettingsTab app={app()} />);
    await userEvent.click(await screen.findByTestId('reset-catalog-url-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('saved-msg').textContent).toContain('Saved at');
    });
  });
});
