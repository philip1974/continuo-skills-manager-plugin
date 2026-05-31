import { co, type CoPluginApp } from './types/sdk-shim';
import { PanelMain } from './ui/PanelMain';
import { SettingsTab } from './ui/SettingsTab';

const { Plugin, React } = co;

// Continuo coApp.dataStore exposes read(pluginId)/write(pluginId, data); plugin
// internally calls dataStore.load()/save(data) without pluginId. Wrap once at
// the boundary so all downstream code keeps its no-arg API.
function makeScopedApp(app: CoPluginApp, pluginId: string): CoPluginApp {
  const realDataStore = app.dataStore as {
    read(id: string): Promise<unknown>;
    write(id: string, data: unknown): Promise<void>;
  };
  return {
    ...app,
    dataStore: {
      load: async () => {
        const v = await realDataStore.read(pluginId);
        return (v ?? {}) as Record<string, unknown>;
      },
      save: async (data: unknown) => {
        await realDataStore.write(pluginId, data);
      },
    },
  };
}

export default class SkillsManagerPlugin extends Plugin {
  constructor(app: CoPluginApp, manifest: any) {
    super(app, manifest);
  }

  override async onload(): Promise<void> {
    const scopedApp = makeScopedApp(this.app, this.manifest.id);
    try {
      const panel = this.app.panels.register({
        type: 'skills-manager',
        title: 'Skills',
        factory: () => React.createElement(PanelMain, { app: scopedApp }),
      });
      this.disposables.push(panel);

      const settingTab = this.app.settingTabs.register({
        id: 'skills-manager-settings',
        title: 'Skills Manager',
        render: () => React.createElement(SettingsTab, { app: scopedApp }),
      });
      this.disposables.push(settingTab);
    } catch (err) {
      console.warn(
        '[skills-manager] onload error, registering degraded settings tab',
        err,
      );
      const fallback = this.app.settingTabs.register({
        id: 'skills-manager-settings-error',
        title: 'Skills Manager (degraded)',
        render: () =>
          React.createElement(
            'div',
            { 'data-testid': 'degraded-banner', role: 'alert' },
            `Skills Manager failed to start: ${(err as Error).message}`,
          ),
      });
      this.disposables.push(fallback);
    }
  }

  override async onunload(): Promise<void> {
    for (const disposable of this.disposables.reverse()) {
      try {
        disposable.dispose();
      } catch {
        // Ignore dispose failures during unload.
      }
    }
    this.disposables = [];
  }

  private disposables: { dispose: () => void }[] = [];
}
