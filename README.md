# Continuo Skills Manager

GUI manager for Claude skills in Continuo. The plugin scans User and Project
scope skill directories, previews catalog entries, and installs only validated
`SKILL.md` content through the Continuo plugin SDK.

## Install (dev)

Local Continuo install for plugin development & smoke testing.

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
