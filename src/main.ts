import * as React from 'react';
import type { CoPluginApp } from './types/sdk-shim';
import { Plugin } from './types/sdk-shim';
import { PanelMain } from './ui/PanelMain';
import { SettingsTab } from './ui/SettingsTab';

export default class SkillsManagerPlugin extends Plugin {
  declare readonly app: CoPluginApp;
  private disposables: { dispose: () => void }[] = [];

  async onload(): Promise<void> {
    try {
      const panel = this.app.panels.register({
        id: 'skills-manager',
        title: 'Skills',
        component: () => React.createElement(PanelMain, { app: this.app }),
      });
      this.disposables.push(panel);

      const settingTab = this.app.settingTabs.register({
        id: 'skills-manager-settings',
        title: 'Skills Manager',
        component: () => React.createElement(SettingsTab, { app: this.app }),
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
        component: () =>
          React.createElement(
            'div',
            { 'data-testid': 'degraded-banner', role: 'alert' },
            `Skills Manager failed to start: ${(err as Error).message}`,
          ),
      });
      this.disposables.push(fallback);
    }
  }

  async onunload(): Promise<void> {
    for (const disposable of this.disposables.reverse()) {
      try {
        disposable.dispose();
      } catch {
        // Ignore dispose failures during unload.
      }
    }
    this.disposables = [];
  }
}
