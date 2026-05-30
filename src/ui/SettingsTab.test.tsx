// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCatalogUrl,
  setUserCatalogUrlOverride,
} from '../catalog/loader';
import { setProjectScopeCwd } from '../scope/path-resolver';
import { SettingsTab } from './SettingsTab';

vi.mock('../catalog/loader', () => ({
  CATALOG_URL_CONFIG_KEY: 'config:catalog-url',
  getCatalogUrl: vi.fn(),
  setUserCatalogUrlOverride: vi.fn(),
}));

vi.mock('../scope/path-resolver', () => ({
  PROJECT_SCOPE_CWD_KEY: 'config:project-scope-cwd',
  setProjectScopeCwd: vi.fn(),
}));

function app(data: Record<string, unknown> = {}) {
  return {
    dataStore: {
      load: vi.fn(async () => data),
      save: vi.fn(),
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
  vi.mocked(setProjectScopeCwd).mockReset().mockResolvedValue(undefined);
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

  it('saves project cwd', async () => {
    render(<SettingsTab app={app()} />);
    const input = (await screen.findByTestId(
      'project-cwd-input',
    )) as HTMLInputElement;
    await userEvent.type(input, '/repo');
    await userEvent.click(screen.getByTestId('save-project-cwd-btn'));
    expect(setProjectScopeCwd).toHaveBeenCalledWith(expect.anything(), '/repo');
  });

  it('clears project cwd', async () => {
    render(<SettingsTab app={app({ 'config:project-scope-cwd': '/repo' })} />);
    await userEvent.click(await screen.findByTestId('clear-project-cwd-btn'));
    expect(setProjectScopeCwd).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('shows saved message after an action', async () => {
    render(<SettingsTab app={app()} />);
    await userEvent.click(await screen.findByTestId('reset-catalog-url-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('saved-msg').textContent).toContain('Saved at');
    });
  });
});
