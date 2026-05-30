import { useEffect, useState } from 'react';
import { scanScope } from '../scanner';
import { resolveProjectScope, resolveUserScope } from '../scope/path-resolver';
import type { SkillRecord } from '../types/data';
import type { CoPluginApp } from '../types/sdk-shim';
import { uninstall } from '../uninstaller';

interface PanelMainProps {
  app: CoPluginApp;
  onInstallClicked?: () => void;
}

export function PanelMain({ app, onInstallClicked }: PanelMainProps) {
  const [userSkills, setUserSkills] = useState<SkillRecord[] | null>(null);
  const [projectSkills, setProjectSkills] = useState<SkillRecord[] | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userRoot = resolveUserScope();
      const resolvedProjectRoot = await resolveProjectScope(app);
      const nextUserSkills = await scanScope(app, userRoot, 'user');
      const nextProjectSkills = resolvedProjectRoot
        ? await scanScope(app, resolvedProjectRoot, 'project')
        : [];
      if (cancelled) return;
      setProjectRoot(resolvedProjectRoot);
      setUserSkills(nextUserSkills);
      setProjectSkills(nextProjectSkills);
    })();
    return () => {
      cancelled = true;
    };
  }, [app, refreshTick]);

  async function handleUninstall(record: SkillRecord) {
    if (busy) return;
    if (!window.confirm(`Uninstall ${record.displayName}?`)) return;
    setBusy(true);
    try {
      await uninstall(app, record);
      setRefreshTick((tick) => tick + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label="Skills Manager">
      <section data-testid="user-scope-section">
        <h3>User scope</h3>
        {(userSkills ?? []).map((record) => (
          <div key={`user:${record.id}`} data-testid={`skill-row-user-${record.id}`}>
            <span>{record.displayName}</span>
            <span>{record.description ?? ''}</span>
            <button onClick={() => handleUninstall(record)} disabled={busy}>
              Uninstall
            </button>
          </div>
        ))}
        {(userSkills ?? []).length === 0 && (
          <p>No skills installed in User scope.</p>
        )}
      </section>

      <section
        data-testid="project-scope-section"
        aria-disabled={projectRoot === null}
        title={
          projectRoot === null
            ? 'Configure Project skills root in Settings or open a git-backed workspace'
            : undefined
        }
        style={{ opacity: projectRoot === null ? 0.5 : 1 }}
      >
        <h3>Project scope</h3>
        {projectRoot === null && (
          <p data-testid="project-disabled-msg">
            Configure Project skills root in Settings or open a git-backed workspace
          </p>
        )}
        {projectRoot !== null &&
          (projectSkills ?? []).map((record) => (
            <div
              key={`project:${record.id}`}
              data-testid={`skill-row-project-${record.id}`}
            >
              <span>{record.displayName}</span>
              <span>{record.description ?? ''}</span>
              <button onClick={() => handleUninstall(record)} disabled={busy}>
                Uninstall
              </button>
            </div>
          ))}
      </section>

      <footer>
        <button onClick={onInstallClicked} data-testid="open-catalog-btn">
          Install from catalog
        </button>
      </footer>
    </div>
  );
}
