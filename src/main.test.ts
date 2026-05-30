import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from './types/sdk-shim';
import SkillsManagerPlugin from './main';

function makePlugin(app: CoPluginApp): SkillsManagerPlugin {
  const plugin = new SkillsManagerPlugin();
  Object.defineProperty(plugin, 'app', {
    configurable: true,
    value: app,
  });
  return plugin;
}

function makeApp(opts?: { panelThrows?: boolean }) {
  const panelDispose = vi.fn();
  const settingDispose = vi.fn();
  const degradedDispose = vi.fn();
  const app = {
    panels: {
      register: vi.fn(() => {
        if (opts?.panelThrows) throw new Error('panel failed');
        return { dispose: panelDispose };
      }),
    },
    settingTabs: {
      register: vi.fn((spec: { id: string }) => {
        if (spec.id === 'skills-manager-settings-error') {
          return { dispose: degradedDispose };
        }
        return { dispose: settingDispose };
      }),
    },
    fs: {
      requestScope: vi.fn(),
    },
    network: {
      requestScope: vi.fn(),
    },
  } as unknown as CoPluginApp;

  return { app, panelDispose, settingDispose, degradedDispose };
}

describe('SkillsManagerPlugin', () => {
  it('registers panel and settings without eager scope requests', async () => {
    const { app } = makeApp();
    await makePlugin(app).onload();
    expect(app.panels.register).toHaveBeenCalledTimes(1);
    expect(app.settingTabs.register).toHaveBeenCalledTimes(1);
    expect((app.fs as unknown as { requestScope: unknown }).requestScope).not.toHaveBeenCalled();
    expect(
      (app.network as unknown as { requestScope: unknown }).requestScope,
    ).not.toHaveBeenCalled();
  });

  it('unloads disposables in reverse order', async () => {
    const calls: string[] = [];
    const app = {
      panels: { register: vi.fn(() => ({ dispose: () => calls.push('panel') })) },
      settingTabs: {
        register: vi.fn(() => ({ dispose: () => calls.push('settings') })),
      },
    } as unknown as CoPluginApp;
    const plugin = makePlugin(app);
    await plugin.onload();
    await plugin.onunload();
    expect(calls).toEqual(['settings', 'panel']);
  });

  it('registers degraded settings tab when panel registration throws', async () => {
    const { app } = makeApp({ panelThrows: true });
    await expect(makePlugin(app).onload()).resolves.toBeUndefined();
    expect(app.settingTabs.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'skills-manager-settings-error' }),
    );
    const spec = vi.mocked(app.settingTabs.register).mock.calls[0]?.[0] as {
      component: () => React.ReactElement;
    };
    expect(spec.component().props['data-testid']).toBe('degraded-banner');
  });

  it('saves the panel disposable', async () => {
    const { app, panelDispose } = makeApp();
    const plugin = makePlugin(app);
    await plugin.onload();
    await plugin.onunload();
    expect(panelDispose).toHaveBeenCalledTimes(1);
  });

  it('saves the settings disposable', async () => {
    const { app, settingDispose } = makeApp();
    const plugin = makePlugin(app);
    await plugin.onload();
    await plugin.onunload();
    expect(settingDispose).toHaveBeenCalledTimes(1);
  });

  it('cleans degraded settings tab on unload', async () => {
    const { app, degradedDispose } = makeApp({ panelThrows: true });
    const plugin = makePlugin(app);
    await plugin.onload();
    await plugin.onunload();
    expect(degradedDispose).toHaveBeenCalledTimes(1);
  });
});
