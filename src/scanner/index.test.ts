import { describe, expect, it, vi } from 'vitest';
import type { CoPluginApp } from '../types/sdk-shim';
import { sep } from '../util/path-polyfill';
import { scanScope } from './index';

type DirEntry = Awaited<ReturnType<CoPluginApp['fs']['listDir']>>[number];

function file(name: string): DirEntry {
  return { name, isFile: true, isDirectory: false, isSymlink: false };
}

function dir(name: string): DirEntry {
  return { name, isFile: false, isDirectory: true, isSymlink: false };
}

function makeApp(entries: DirEntry[] | Error, files: Record<string, string>): CoPluginApp {
  return {
    fs: {
      listDir: vi.fn(async () => {
        if (entries instanceof Error) throw entries;
        return entries;
      }),
      readFile: vi.fn(async (path: string) => {
        const value = files[path];
        if (value === undefined) throw new Error('missing');
        return value;
      }),
    },
  } as unknown as CoPluginApp;
}

describe('scanScope', () => {
  it('returns empty records for an empty root', async () => {
    await expect(scanScope(makeApp([], {}), '/skills', 'user')).resolves.toEqual([]);
  });

  it('returns empty records when the root does not exist', async () => {
    await expect(
      scanScope(makeApp(new Error('missing'), {}), '/skills', 'user'),
    ).resolves.toEqual([]);
  });

  it('scans single-file skills', async () => {
    const app = makeApp([file('one.md'), file('two.md')], {
      [`/skills${sep}one.md`]: '# One',
      [`/skills${sep}two.md`]: '# Two',
    });
    const records = await scanScope(app, '/skills', 'user');
    expect(records).toMatchObject([
      { id: 'one', source: 'single-file', displayName: 'one' },
      { id: 'two', source: 'single-file', displayName: 'two' },
    ]);
  });

  it('scans directory skills with SKILL.md', async () => {
    const app = makeApp([dir('one'), dir('two')], {
      [`/skills${sep}one${sep}SKILL.md`]: '# One',
      [`/skills${sep}two${sep}SKILL.md`]: '# Two',
    });
    const records = await scanScope(app, '/skills', 'project');
    expect(records).toMatchObject([
      { id: 'one', source: 'directory', scope: 'project' },
      { id: 'two', source: 'directory', scope: 'project' },
    ]);
  });

  it('scans mixed single-file and directory skills', async () => {
    const app = makeApp([file('one.md'), dir('two')], {
      [`/skills${sep}one.md`]: '# One',
      [`/skills${sep}two${sep}SKILL.md`]: '# Two',
    });
    await expect(scanScope(app, '/skills', 'user')).resolves.toHaveLength(2);
  });

  it('skips directories without SKILL.md', async () => {
    const app = makeApp([dir('not-skill')], {});
    await expect(scanScope(app, '/skills', 'user')).resolves.toEqual([]);
  });

  it('extracts frontmatter name into displayName', async () => {
    const app = makeApp([file('one.md')], {
      [`/skills${sep}one.md`]: '---\nname: "Readable Name"\n---\n# Body',
    });
    const [record] = await scanScope(app, '/skills', 'user');
    expect(record?.displayName).toBe('Readable Name');
  });

  it('extracts frontmatter description', async () => {
    const app = makeApp([dir('one')], {
      [`/skills${sep}one${sep}SKILL.md`]:
        "---\ndescription: 'Helpful skill'\n---\n# Body",
    });
    const [record] = await scanScope(app, '/skills', 'user');
    expect(record?.description).toBe('Helpful skill');
  });

  it('uses id as displayName when frontmatter is missing', async () => {
    const app = makeApp([file('plain.md')], {
      [`/skills${sep}plain.md`]: '# Plain',
    });
    const [record] = await scanScope(app, '/skills', 'user');
    expect(record?.displayName).toBe('plain');
  });
});
