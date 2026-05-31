import {
  getCatalogUrl,
  setUserCatalogUrlOverride,
} from '../catalog/loader';
import { isPlaceholderCatalogUrl } from '../config/catalog-allowlist';
import {
  PROJECT_SCOPE_CWD_KEY,
  setProjectScopeCwd,
} from '../scope/path-resolver';
import { co, type CoPluginApp } from '../types/sdk-shim';

const { React } = co;
const h = React.createElement;

interface SettingsTabProps {
  app: CoPluginApp;
}

export function SettingsTab({ app }: SettingsTabProps) {
  const [catalogUrl, setCatalogUrl] = React.useState<string>('');
  const [catalogInput, setCatalogInput] = React.useState<string>('');
  const [projectCwd, setProjectCwdState] = React.useState<string>('');
  const [projectInput, setProjectInput] = React.useState<string>('');
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
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

  return h(
    'div',
    { role: 'region', 'aria-label': 'Skills Manager Settings' },
    showPlaceholderBanner &&
      h(
        'div',
        {
          role: 'alert',
          'data-testid': 'placeholder-banner',
          style: { background: '#fef3c7', padding: 8 },
        },
        'Configure catalog URL - the default contains a placeholder.',
      ),
    h(
      'section',
      { 'data-testid': 'catalog-url-section' },
      h('h3', null, 'Catalog URL'),
      h('input', {
        type: 'text',
        value: catalogInput,
        onChange: (event: { target: { value: string } }) =>
          setCatalogInput(event.target.value),
        'data-testid': 'catalog-url-input',
      }),
      h(
        'button',
        {
          onClick: () => saveCatalogUrl(catalogInput),
          'data-testid': 'save-catalog-url-btn',
        },
        'Save',
      ),
      h(
        'button',
        {
          onClick: () => saveCatalogUrl(null),
          'data-testid': 'reset-catalog-url-btn',
        },
        'Reset to default',
      ),
      h('p', null, 'Effective: ', catalogUrl),
    ),
    h(
      'section',
      { 'data-testid': 'project-cwd-section' },
      h('h3', null, 'Project skills root (cwd of your git-backed workspace)'),
      h('input', {
        type: 'text',
        value: projectInput,
        onChange: (event: { target: { value: string } }) =>
          setProjectInput(event.target.value),
        placeholder: '/path/to/your/git/repo',
        'data-testid': 'project-cwd-input',
      }),
      h(
        'button',
        {
          onClick: () =>
            saveProjectCwd(projectInput.trim() ? projectInput : null),
          'data-testid': 'save-project-cwd-btn',
        },
        'Save',
      ),
      h(
        'button',
        {
          onClick: () => saveProjectCwd(null),
          'data-testid': 'clear-project-cwd-btn',
        },
        'Clear',
      ),
      h('p', null, 'Current: ', projectCwd || '(not configured)'),
    ),
    savedAt !== null &&
      h(
        'p',
        { 'data-testid': 'saved-msg' },
        `Saved at ${new Date(savedAt).toISOString()}`,
      ),
  );
}
