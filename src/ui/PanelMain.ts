import { loadCatalog } from '../catalog/loader';
import { commit } from '../installer/commit';
import { cloneAtSha } from '../installer/clone';
import { validateAndIssueReceipt } from '../installer/validate';
import { scanScope } from '../scanner';
import { resolveProjectScope, resolveUserScope } from '../scope/path-resolver';
import type { CatalogEntry, CatalogIndex, SkillRecord } from '../types/data';
import { co, type CoPluginApp } from '../types/sdk-shim';
import { uninstall } from '../uninstaller';
import { sep } from '../util/path-polyfill';

const { React } = co;
const h = React.createElement;

interface PanelMainProps {
  app: CoPluginApp;
  onInstallClicked?: () => void;
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
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--md-fg-dim, #6a6a6a)',
    margin: '20px 0 10px',
  } as CSS,
  sectionTitleFirst: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--md-fg-dim, #6a6a6a)',
    margin: '0 0 10px',
  } as CSS,
  card: {
    border: '1px solid var(--md-line, #2a2a2a)',
    background: 'var(--md-panel, #1a1a1a)',
    borderRadius: 6,
    padding: '12px 14px',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  } as CSS,
  cardDisabled: {
    border: '1px dashed var(--md-line, #2a2a2a)',
    background: 'transparent',
    borderRadius: 6,
    padding: '12px 14px',
    marginBottom: 8,
    color: 'var(--md-fg-dim, #6a6a6a)',
  } as CSS,
  cardBody: {
    flex: 1,
    minWidth: 0,
  } as CSS,
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--md-fg, #e6e6e6)',
    marginBottom: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as CSS,
  cardDesc: {
    fontSize: 11,
    color: 'var(--md-fg-muted, #9a9a9a)',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  } as CSS,
  cardMeta: {
    fontSize: 10,
    color: 'var(--md-fg-dim, #6a6a6a)',
    marginTop: 6,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
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
  btnDisabled: {
    border: '1px solid var(--md-line, #2a2a2a)',
    borderRadius: 4,
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
    background: 'transparent',
    color: 'var(--md-fg-dim, #555)',
    opacity: 0.6,
  } as CSS,
  installedBadge: {
    fontSize: 10,
    padding: '4px 8px',
    borderRadius: 3,
    background: 'var(--md-panel-soft, #222)',
    color: 'var(--md-fg-muted, #8a8a8a)',
    whiteSpace: 'nowrap',
  } as CSS,
  errorBox: {
    border: '1px solid #6b3030',
    background: '#3a1818',
    color: '#f0b0b0',
    borderRadius: 4,
    padding: '8px 10px',
    fontSize: 11,
    marginBottom: 8,
  } as CSS,
  emptyMsg: {
    fontSize: 11,
    color: 'var(--md-fg-dim, #6a6a6a)',
    fontStyle: 'italic',
    padding: '8px 14px',
  } as CSS,
};

function skillCard(
  record: SkillRecord,
  scopeLabel: 'user' | 'project',
  busy: boolean,
  busyId: string | null,
  onUninstall: (r: SkillRecord) => void,
): unknown {
  const isBusy = busy && busyId === record.id;
  return h(
    'div',
    {
      key: `${scopeLabel}:${record.id}`,
      'data-testid': `skill-row-${scopeLabel}-${record.id}`,
      style: styles.card,
    },
    h(
      'div',
      { style: styles.cardBody },
      h('div', { style: styles.cardTitle }, record.displayName),
      record.description &&
        h('div', { style: styles.cardDesc }, record.description),
      h('div', { style: styles.cardMeta }, record.id),
    ),
    h(
      'button',
      {
        onClick: () => onUninstall(record),
        disabled: busy,
        style: busy ? styles.btnDisabled : styles.btnGhost,
      },
      isBusy ? 'Removing…' : 'Uninstall',
    ),
  );
}

const PLACEHOLDER_SHA = '0'.repeat(40);

function isPlaceholderSha(sha: string): boolean {
  return sha === PLACEHOLDER_SHA || /^0+$/.test(sha);
}

function scopeButton(
  scope: 'user' | 'project',
  scopeAvailable: boolean,
  installedHere: SkillRecord | null,
  entry: CatalogEntry,
  busy: boolean,
  isBusy: boolean,
  placeholder: boolean,
  onInstall: (e: CatalogEntry, s: 'user' | 'project') => void,
  onUninstall: (r: SkillRecord) => void,
): unknown {
  const scopeLabel = scope === 'user' ? 'User' : 'Project';
  const testId = `catalog-${scope}-btn-${entry.id}`;

  // Project not configured: disabled hint
  if (scope === 'project' && !scopeAvailable) {
    return h(
      'button',
      {
        key: scope,
        'data-testid': testId,
        disabled: true,
        style: styles.btnDisabled,
        title: 'Configure Project skills root in Settings or open a git-backed workspace.',
      },
      `${scopeLabel}: N/A`,
    );
  }

  // Already installed in this scope → Uninstall
  if (installedHere) {
    return h(
      'button',
      {
        key: scope,
        'data-testid': testId,
        onClick: () => onUninstall(installedHere),
        disabled: busy,
        style: busy ? styles.btnDisabled : styles.btnGhost,
      },
      isBusy ? `${scopeLabel}: Removing…` : `Uninstall ${scopeLabel}`,
    );
  }

  // Placeholder SHA → no install possible
  if (placeholder) {
    return h(
      'button',
      {
        key: scope,
        'data-testid': testId,
        disabled: true,
        style: styles.btnDisabled,
        title: 'Catalog entry has placeholder SHA — not installable yet.',
      },
      `Install ${scopeLabel}`,
    );
  }

  // Install in this scope
  return h(
    'button',
    {
      key: scope,
      'data-testid': testId,
      onClick: () => onInstall(entry, scope),
      disabled: busy,
      style: busy ? styles.btnDisabled : styles.btnPrimary,
    },
    isBusy ? `Installing ${scopeLabel}…` : `Install ${scopeLabel}`,
  );
}

function catalogCard(
  entry: CatalogEntry,
  userInstalled: SkillRecord | null,
  projectInstalled: SkillRecord | null,
  projectSupported: boolean,
  busy: boolean,
  busyId: string | null,
  onInstall: (e: CatalogEntry, scope: 'user' | 'project') => void,
  onUninstall: (r: SkillRecord) => void,
): unknown {
  const isBusy = busy && busyId === entry.id;
  const placeholder = isPlaceholderSha(entry.sha);
  return h(
    'div',
    {
      key: `catalog:${entry.id}`,
      'data-testid': `catalog-row-${entry.id}`,
      style: styles.card,
    },
    h(
      'div',
      { style: styles.cardBody },
      h(
        'div',
        { style: styles.cardTitle },
        entry.name,
        entry.version &&
          h(
            'span',
            {
              style: {
                marginLeft: 8,
                fontSize: 10,
                color: 'var(--md-fg-dim, #6a6a6a)',
                fontWeight: 400,
              },
            },
            `v${entry.version}`,
          ),
        placeholder &&
          h(
            'span',
            {
              style: {
                marginLeft: 8,
                fontSize: 10,
                color: '#d4a04a',
                fontWeight: 500,
                padding: '2px 6px',
                borderRadius: 3,
                border: '1px solid #6b5020',
                background: '#3a2a10',
              },
              title:
                'Catalog entry is a seed placeholder — SHA not yet populated; not installable.',
            },
            'seed',
          ),
      ),
      entry.description &&
        h('div', { style: styles.cardDesc }, entry.description),
      h('div', { style: styles.cardMeta }, `${entry.id} · ${entry.sha.slice(0, 7)}`),
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'stretch',
          minWidth: 130,
        },
      },
      scopeButton(
        'user',
        true,
        userInstalled,
        entry,
        busy,
        isBusy,
        placeholder,
        onInstall,
        onUninstall,
      ),
      scopeButton(
        'project',
        projectSupported,
        projectInstalled,
        entry,
        busy,
        isBusy,
        placeholder,
        onInstall,
        onUninstall,
      ),
    ),
  );
}

export function PanelMain({ app }: PanelMainProps) {
  const [userSkills, setUserSkills] = React.useState<SkillRecord[] | null>(null);
  const [projectSkills, setProjectSkills] = React.useState<SkillRecord[] | null>(
    null,
  );
  const [projectRoot, setProjectRoot] = React.useState<string | null>(null);
  const [userRoot, setUserRoot] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [catalog, setCatalog] = React.useState<CatalogIndex | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  // Scope is granted once per app instance and stays granted for the session
  // (host persists it). Re-running requestScope on every refreshTick (install /
  // uninstall) is a redundant IPC round-trip — and historically re-prompted —
  // so cache the grant decision per app and skip the request on later refreshes.
  // Reset implicitly when the `app` prop identity changes.
  const grantRef = React.useRef<{ app: CoPluginApp; granted: boolean } | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const uRoot = await resolveUserScope(app);
      const pRoot = await resolveProjectScope(app);
      // Workspace's <ws>/.claude parent — broader than .claude/skills so plugin
      // can mkdir the skills subdir when it doesn't exist yet (fresh project).
      // resolveForWrite scope-check needs `.claude` to be the granted path
      // (or an ancestor) to permit creating its `skills` child.
      const ws = await app.workspace.getRoot();
      const projectClaude = ws ? `${ws}${sep}.claude` : null;

      let granted: boolean;
      const cached = grantRef.current;
      if (cached && cached.app === app) {
        // Already requested for this app instance — reuse the decision, no prompt.
        granted = cached.granted;
      } else {
        // Request 'rw' upfront — covers scan (read) + install (write) +
        // mkdir of bootstrap dirs. One prompt vs separate per-op prompts.
        const scopes: { path: string; mode: 'r' | 'rw' }[] = [
          { path: uRoot, mode: 'rw' },
        ];
        if (projectClaude) scopes.push({ path: projectClaude, mode: 'rw' });
        try {
          granted = (await app.fs.requestScope(scopes)) === 'grant';
        } catch {
          granted = false;
        }
        grantRef.current = { app, granted };

        // Bootstrap project dirs so subsequent install (which mkdir's tmpDir
        // under projectSkillsRoot) finds the parent chain in place. Only needed
        // once after the initial grant; idempotent + best-effort (silent on
        // mkdir failure: permissions / race etc).
        if (granted && projectClaude && pRoot) {
          try {
            await app.fs.mkdir(projectClaude, { recursive: true });
          } catch {
            // ignore
          }
          try {
            await app.fs.mkdir(pRoot, { recursive: true });
          } catch {
            // ignore
          }
        }
      }

      const nextUser = granted ? await scanScope(app, uRoot, 'user') : [];
      const nextProject =
        granted && pRoot ? await scanScope(app, pRoot, 'project') : [];

      // Catalog is best-effort — placeholder URL / network fail just hides catalog.
      let nextCatalog: CatalogIndex | null = null;
      let nextCatErr: string | null = null;
      try {
        nextCatalog = await loadCatalog(app);
      } catch (e) {
        nextCatErr = e instanceof Error ? e.message : String(e);
      }

      if (cancelled) return;
      setUserRoot(uRoot);
      setProjectRoot(pRoot);
      setUserSkills(nextUser);
      setProjectSkills(nextProject);
      setCatalog(nextCatalog);
      setCatalogError(nextCatErr);
    })();
    return () => {
      cancelled = true;
    };
  }, [app, refreshTick]);

  async function handleUninstall(record: SkillRecord): Promise<void> {
    if (busy) return;
    if (!window.confirm(`Uninstall ${record.displayName}?`)) return;
    setBusy(true);
    setBusyId(record.id);
    try {
      await uninstall(app, record);
      setRefreshTick((tick) => tick + 1);
    } catch (e) {
      window.alert(`Uninstall failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }

  async function handleInstall(
    entry: CatalogEntry,
    scope: 'user' | 'project',
  ): Promise<void> {
    if (busy) return;
    const root = scope === 'user' ? userRoot : projectRoot;
    if (!root) {
      window.alert(
        scope === 'project'
          ? 'Project skills root not configured. Set it in Settings first.'
          : 'User scope unavailable.',
      );
      return;
    }
    setBusy(true);
    setBusyId(entry.id);
    const finalTarget = `${root}${sep}${entry.id}`;
    const tmpDir = `${root}${sep}.tmp-install-${entry.id}-${Date.now()}`;
    try {
      const { canonicalDir } = await cloneAtSha(app, {
        gitUrl: entry.gitUrl,
        sha: entry.sha,
        tmpDir,
      });
      const receipt = await validateAndIssueReceipt(app, {
        entry,
        repoDir: canonicalDir,
        scope,
        finalTarget,
      });
      await commit(app, {
        entry,
        repoDir: canonicalDir,
        receipt,
        overwrite: true,
      });
      try {
        await app.fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      setRefreshTick((tick) => tick + 1);
    } catch (e) {
      try {
        await app.fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      window.alert(
        `Install failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }

  const userInstalledById = new Map<string, SkillRecord>();
  for (const r of userSkills ?? []) userInstalledById.set(r.id, r);
  const projectInstalledById = new Map<string, SkillRecord>();
  for (const r of projectSkills ?? []) projectInstalledById.set(r.id, r);

  return h(
    'div',
    {
      role: 'region',
      'aria-label': 'Continuo CLAUDE Code skills manager',
      style: styles.region,
    },
    // User scope
    h(
      'section',
      { 'data-testid': 'user-scope-section' },
      h('h3', { style: styles.sectionTitleFirst }, `User scope (${(userSkills ?? []).length})`),
      (userSkills ?? []).length === 0
        ? h('div', { style: styles.emptyMsg }, 'No skills installed in User scope.')
        : (userSkills ?? []).map((r) =>
            skillCard(r, 'user', busy, busyId, handleUninstall),
          ),
    ),
    // Project scope
    h(
      'section',
      {
        'data-testid': 'project-scope-section',
        'aria-disabled': projectRoot === null,
      },
      h('h3', { style: styles.sectionTitle }, `Project scope${projectRoot ? ` (${(projectSkills ?? []).length})` : ''}`),
      projectRoot === null
        ? h(
            'div',
            {
              'data-testid': 'project-disabled-msg',
              style: styles.cardDisabled,
            },
            'Configure Project skills root in Settings or open a git-backed workspace.',
          )
        : (projectSkills ?? []).length === 0
          ? h('div', { style: styles.emptyMsg }, 'No skills installed in Project scope.')
          : (projectSkills ?? []).map((r) =>
              skillCard(r, 'project', busy, busyId, handleUninstall),
            ),
    ),
    // Catalog
    h(
      'section',
      { 'data-testid': 'catalog-section' },
      h('h3', { style: styles.sectionTitle }, `Catalog${catalog ? ` (${catalog.entries.length})` : ''}`),
      catalogError &&
        h(
          'div',
          { style: styles.errorBox, 'data-testid': 'catalog-error' },
          catalogError,
        ),
      catalog &&
        catalog.entries.length === 0 &&
        h('div', { style: styles.emptyMsg }, 'Catalog is empty.'),
      catalog &&
        catalog.entries.map((entry) =>
          catalogCard(
            entry,
            userInstalledById.get(entry.id) ?? null,
            projectInstalledById.get(entry.id) ?? null,
            projectRoot !== null,
            busy,
            busyId,
            handleInstall,
            handleUninstall,
          ),
        ),
    ),
  );
}
