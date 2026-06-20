# Continuo CLAUDE Code skills manager

GUI manager for Claude Code skills in Continuo. The plugin scans User and Project
scope skill directories, previews catalog entries, and installs only validated
`SKILL.md` content through the Continuo plugin SDK.

## Install (Continuo marketplace)

This is the supported install path for end users.

1. Open Continuo → **Settings → Marketplace**.
2. Find **Continuo CLAUDE Code skills manager** in the list and click **Install**.
3. Grant the requested permissions (`fs`, `network`, `shell`) when prompted.
4. The plugin loads immediately; it appears as the **Skills** panel and a
   **Continuo CLAUDE Code skills manager** settings tab.

Under the hood the marketplace does `git clone --depth 1` of this repo into
`~/Library/Application Support/Continuo/plugins/com.continuo.skills-manager/` and
copies it verbatim — **there is no build step on the host**. That is why the
runnable bundle `dist/main.js` is committed to this repo (see `.gitignore`).

> Maintainers: the marketplace listing lives in
> [`philip1974/continuo-plugins`](https://github.com/philip1974/continuo-plugins)
> `index.json`. See [Publishing to the marketplace](#publishing-to-the-marketplace).

## Install (dev)

Local Continuo install for plugin development & smoke testing (bypasses the
marketplace; copies straight into Continuo userData).

```bash
# Build + install in one shot
pnpm install:dev

# Uninstall
pnpm install:dev -- --uninstall
```

The `--` separator is required so pnpm passes `--uninstall` through to the script.

**Mode**: copy only. The plugin manifest + `dist/` + README are copied into:
- macOS: `~/Library/Application Support/Continuo/plugins/com.continuo.skills-manager/`

After install, **restart Continuo** to load the plugin. Iteration loop:

```bash
# Edit source -> rebuild + reinstall -> restart Continuo
pnpm install:dev
```

Symlink mode is **not supported in v0.1** (deferred follow-up).

## Publishing to the marketplace

The marketplace is a curated index — a single `index.json` in the public repo
[`philip1974/continuo-plugins`](https://github.com/philip1974/continuo-plugins).
To list (or update) this plugin, open a PR there adding/editing its row:

```json
{
  "id": "com.continuo.skills-manager",
  "name": "Continuo CLAUDE Code skills manager",
  "description": "GUI manager for Claude Code skills (User + Project scope; SKILL.md preview required before install).",
  "author": "philip1974",
  "authorUrl": "https://github.com/philip1974",
  "repo": "philip1974/continuo-skills-manager-plugin",
  "branch": "main",
  "tags": ["skills", "claude-code", "manager"],
  "verified": true
}
```

Before publishing, make sure the latest `dist/main.js` and a bumped
`manifest.json` `version` are committed and pushed to `main` — the marketplace
clones whatever is on that branch, and reads the version from the plugin's own
`manifest.json` (the index intentionally carries no `version`).
