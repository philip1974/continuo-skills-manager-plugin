import { useEffect, useState } from 'react';
import {
  getCatalogUrl,
  setUserCatalogUrlOverride,
} from '../catalog/loader';
import { isPlaceholderCatalogUrl } from '../config/catalog-allowlist';
import {
  PROJECT_SCOPE_CWD_KEY,
  setProjectScopeCwd,
} from '../scope/path-resolver';
import type { CoPluginApp } from '../types/sdk-shim';

interface SettingsTabProps {
  app: CoPluginApp;
}

export function SettingsTab({ app }: SettingsTabProps) {
  const [catalogUrl, setCatalogUrl] = useState<string>('');
  const [catalogInput, setCatalogInput] = useState<string>('');
  const [projectCwd, setProjectCwdState] = useState<string>('');
  const [projectInput, setProjectInput] = useState<string>('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getCatalogUrl(app);
      const data = await app.dataStore.load();
      const cwd = (data[PROJECT_SCOPE_CWD_KEY] as string | undefined) ?? '';
      if (cancelled) return;
      setCatalogUrl(url);
      setCatalogInput(url);
      setProjectCwdState(cwd);
      setProjectInput(cwd);
    })();
    return () => {
      cancelled = true;
    };
  }, [app]);

  async function saveCatalogUrl(url: string | null) {
    await setUserCatalogUrlOverride(app, url);
    const effective = await getCatalogUrl(app);
    setCatalogUrl(effective);
    setCatalogInput(effective);
    setSavedAt(Date.now());
  }

  async function saveProjectCwd(cwd: string | null) {
    await setProjectScopeCwd(app, cwd);
    setProjectCwdState(cwd ?? '');
    setProjectInput(cwd ?? '');
    setSavedAt(Date.now());
  }

  const showPlaceholderBanner = isPlaceholderCatalogUrl(catalogUrl);

  return (
    <div role="region" aria-label="Skills Manager Settings">
      {showPlaceholderBanner && (
        <div
          role="alert"
          data-testid="placeholder-banner"
          style={{ background: '#fef3c7', padding: 8 }}
        >
          Configure catalog URL - the default contains a placeholder.
        </div>
      )}

      <section data-testid="catalog-url-section">
        <h3>Catalog URL</h3>
        <input
          type="text"
          value={catalogInput}
          onChange={(event) => setCatalogInput(event.target.value)}
          data-testid="catalog-url-input"
        />
        <button
          onClick={() => saveCatalogUrl(catalogInput)}
          data-testid="save-catalog-url-btn"
        >
          Save
        </button>
        <button
          onClick={() => saveCatalogUrl(null)}
          data-testid="reset-catalog-url-btn"
        >
          Reset to default
        </button>
        <p>Effective: {catalogUrl}</p>
      </section>

      <section data-testid="project-cwd-section">
        <h3>Project skills root (cwd of your git-backed workspace)</h3>
        <input
          type="text"
          value={projectInput}
          onChange={(event) => setProjectInput(event.target.value)}
          placeholder="/path/to/your/git/repo"
          data-testid="project-cwd-input"
        />
        <button
          onClick={() => saveProjectCwd(projectInput.trim() ? projectInput : null)}
          data-testid="save-project-cwd-btn"
        >
          Save
        </button>
        <button
          onClick={() => saveProjectCwd(null)}
          data-testid="clear-project-cwd-btn"
        >
          Clear
        </button>
        <p>Current: {projectCwd || '(not configured)'}</p>
      </section>

      {savedAt !== null && (
        <p data-testid="saved-msg">Saved at {new Date(savedAt).toISOString()}</p>
      )}
    </div>
  );
}
