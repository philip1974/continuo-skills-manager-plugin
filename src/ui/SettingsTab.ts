import {
  getCatalogUrl,
  setUserCatalogUrlOverride,
} from '../catalog/loader';
import { isPlaceholderCatalogUrl } from '../config/catalog-allowlist';
import { resolveProjectScope } from '../scope/path-resolver';
import { co, type CoPluginApp } from '../types/sdk-shim';

const { React } = co;
const h = React.createElement;

interface SettingsTabProps {
  app: CoPluginApp;
}

type CSS = Record<string, string | number>;

const styles = {
  region: {
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: 16,
    color: 'var(--md-fg, #e6e6e6)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
  } as CSS,
  section: {
    border: '1px solid var(--md-line, #2a2a2a)',
    background: 'var(--md-panel, #1a1a1a)',
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
  } as CSS,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--md-fg, #e6e6e6)',
    margin: '0 0 6px',
  } as CSS,
  sectionHint: {
    fontSize: 11,
    color: 'var(--md-fg-muted, #9a9a9a)',
    margin: '0 0 12px',
  } as CSS,
  inputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  } as CSS,
  input: {
    flex: 1,
    minWidth: 0,
    background: 'var(--md-panel-soft, #0e0e0e)',
    border: '1px solid var(--md-line, #2a2a2a)',
    borderRadius: 4,
    color: 'var(--md-fg, #e6e6e6)',
    padding: '6px 10px',
    fontSize: 12,
    fontFamily:
      'ui-monospace, SFMono-Regular, Consolas, monospace',
    outline: 'none',
  } as CSS,
  btnPrimary: {
    border: 'none',
    borderRadius: 4,
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: 'var(--md-accent, #4a7afd)',
    color: '#fff',
  } as CSS,
  btnGhost: {
    border: '1px solid var(--md-line, #3a3a3a)',
    borderRadius: 4,
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: 'transparent',
    color: 'var(--md-fg-muted, #aaa)',
  } as CSS,
  effectiveLine: {
    fontSize: 11,
    color: 'var(--md-fg-dim, #6a6a6a)',
    margin: '6px 0 0',
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    wordBreak: 'break-all',
  } as CSS,
  banner: {
    background: '#3a2a10',
    border: '1px solid #6b5020',
    color: '#d4a04a',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 11,
    marginBottom: 12,
  } as CSS,
  savedMsg: {
    fontSize: 10,
    color: 'var(--md-fg-dim, #6a6a6a)',
    marginTop: 8,
  } as CSS,
};

export function SettingsTab({ app }: SettingsTabProps) {
  const [catalogUrl, setCatalogUrl] = React.useState<string>('');
  const [catalogInput, setCatalogInput] = React.useState<string>('');
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null);
  const [projectSkillsRoot, setProjectSkillsRoot] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getCatalogUrl(app);
      const ws = await app.workspace.getRoot();
      const psr = await resolveProjectScope(app);
      if (cancelled) return;
      setCatalogUrl(url);
      setCatalogInput(url);
      setWorkspaceRoot(ws);
      setProjectSkillsRoot(psr);
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

  const showPlaceholderBanner = isPlaceholderCatalogUrl(catalogUrl);

  return h(
    'div',
    {
      role: 'region',
      'aria-label': 'Continuo CLAUDE Code skills manager Settings',
      style: styles.region,
    },
    showPlaceholderBanner &&
      h(
        'div',
        {
          role: 'alert',
          'data-testid': 'placeholder-banner',
          style: styles.banner,
        },
        'Configure catalog URL — the default contains a placeholder.',
      ),
    // Catalog URL
    h(
      'section',
      { 'data-testid': 'catalog-url-section', style: styles.section },
      h('h3', { style: styles.sectionTitle }, 'Catalog URL'),
      h(
        'p',
        { style: styles.sectionHint },
        'GitHub raw JSON URL the plugin fetches catalog entries from.',
      ),
      h(
        'div',
        { style: styles.inputRow },
        h('input', {
          type: 'text',
          value: catalogInput,
          onChange: (event: { target: { value: string } }) =>
            setCatalogInput(event.target.value),
          placeholder: 'https://raw.githubusercontent.com/...',
          'data-testid': 'catalog-url-input',
          style: styles.input,
        }),
        h(
          'button',
          {
            onClick: () => saveCatalogUrl(catalogInput),
            'data-testid': 'save-catalog-url-btn',
            style: styles.btnPrimary,
          },
          'Save',
        ),
        h(
          'button',
          {
            onClick: () => saveCatalogUrl(null),
            'data-testid': 'reset-catalog-url-btn',
            style: styles.btnGhost,
          },
          'Reset to default',
        ),
      ),
      h('p', { style: styles.effectiveLine }, `Effective: ${catalogUrl}`),
    ),
    // Project scope (auto from workspace)
    h(
      'section',
      { 'data-testid': 'project-cwd-section', style: styles.section },
      h('h3', { style: styles.sectionTitle }, 'Project skills root (auto)'),
      h(
        'p',
        { style: styles.sectionHint },
        'Project scope tracks the current Continuo window’s workspace root. Open a git-backed folder in the explorer; skills install to <workspace>/.claude/skills/. No manual configuration.',
      ),
      h(
        'p',
        { style: styles.effectiveLine, 'data-testid': 'workspace-line' },
        `Workspace: ${workspaceRoot ?? '(no folder open)'}`,
      ),
      h(
        'p',
        { style: styles.effectiveLine, 'data-testid': 'project-skills-line' },
        `Project skills root: ${projectSkillsRoot ?? '(unavailable — open a git-backed workspace)'}`,
      ),
      h(
        'p',
        {
          style: {
            ...styles.sectionHint,
            margin: '8px 0 0',
            fontStyle: 'italic',
          },
        },
        workspaceRoot && !projectSkillsRoot
          ? 'Workspace is open but git rev-parse failed — folder isn’t a git repo, so Project scope is disabled.'
          : 'After switching workspaces, close and reopen the Skills panel to refresh Project buttons.',
      ),
    ),
    savedAt !== null &&
      h(
        'p',
        { 'data-testid': 'saved-msg', style: styles.savedMsg },
        `Saved at ${new Date(savedAt).toLocaleTimeString()}`,
      ),
  );
}
