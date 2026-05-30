// Scan skill roots and return normalized SkillRecord values.

import { sep } from 'node:path';
import type { CoPluginApp } from '../types/sdk-shim';
import type { ScopeRoot, SkillRecord } from '../types/data';

const SKILL_MD = 'SKILL.md';

interface FrontmatterParsed {
  name?: string;
  description?: string;
}

function parseFrontmatter(content: string): FrontmatterParsed {
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---\n', 4);
  if (end < 0) return {};

  const yaml = content.slice(4, end);
  const result: FrontmatterParsed = {};
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(name|description)\s*:\s*(.+)$/);
    if (match?.[1] && match[2]) {
      const key = match[1] as 'name' | 'description';
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}

export async function scanScope(
  app: CoPluginApp,
  root: string,
  scope: ScopeRoot,
): Promise<SkillRecord[]> {
  const records: SkillRecord[] = [];
  let entries: Awaited<ReturnType<CoPluginApp['fs']['listDir']>>;
  try {
    entries = await app.fs.listDir(root);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.isFile && entry.name.endsWith('.md') && entry.name !== SKILL_MD) {
      const fullPath = `${root}${sep}${entry.name}`;
      try {
        const content = await app.fs.readFile(fullPath);
        const fm = parseFrontmatter(content);
        const id = entry.name.replace(/\.md$/, '');
        records.push({
          id,
          displayName: fm.name ?? id,
          ...(fm.description !== undefined && { description: fm.description }),
          scope,
          source: 'single-file',
          path: fullPath,
        });
      } catch {
        // Ignore unreadable files.
      }
    } else if (entry.isDirectory) {
      const skillMdPath = `${root}${sep}${entry.name}${sep}${SKILL_MD}`;
      try {
        const content = await app.fs.readFile(skillMdPath);
        const fm = parseFrontmatter(content);
        records.push({
          id: entry.name,
          displayName: fm.name ?? entry.name,
          ...(fm.description !== undefined && { description: fm.description }),
          scope,
          source: 'directory',
          path: skillMdPath,
        });
      } catch {
        // Directory without readable SKILL.md is not a skill.
      }
    }
  }

  return records;
}
