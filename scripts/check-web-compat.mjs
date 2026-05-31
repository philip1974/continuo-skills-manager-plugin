#!/usr/bin/env node
// Static grep gate: catch Node-only APIs in plugin production source.
//
// Plugin runs in Continuo's sandboxed renderer:
//   - CSP `script-src 'self' blob:` rejects `node:*` specifier imports.
//   - Node globals (Buffer, NodeJS.Signals, process, __dirname, etc.) are
//     not injected — Buffer.concat / Buffer.from / `.toString('utf-8')`
//     crash with "Buffer is not defined" or return garbage.
//
// topic-05 plan-v3 Op13 only grep'd `from "node:"` imports → missed Node
// globals → install pipeline broke on first run (Op19.6 Buffer.concat).
// This gate prevents the regression.
//
// Run: `pnpm check:web-compat` (or auto via build.mjs prebuild hook).
// CI: same script in .github/workflows/ci.yml.
//
// Scope: src/ ONLY. Excludes __tests__, *.test.*, scripts/, build.mjs.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const EXCLUDE_DIR_NAMES = new Set(['__tests__', 'node_modules']);
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const EXCLUDE_FILE = /\.(test|spec|bench)\.(ts|tsx|js)$/;

/**
 * Each pattern: { re, label, why }.
 * `re` matches forbidden API; `why` is shown in the error to explain
 * what to substitute (helps future maintainers fix quickly).
 */
const PATTERNS = [
  {
    re: /from\s*['"]node:/,
    label: 'node:* import',
    why: 'CSP blocks node:* in renderer. Use Web API (crypto.subtle, fetch, URL, TextDecoder) or a polyfill.',
  },
  {
    re: /\bBuffer\.(concat|from|isBuffer|alloc|allocUnsafe|byteLength)\b/,
    label: 'Buffer.* (Node global)',
    why: 'Use Uint8Array + util/web-crypto-helpers concatBytes / TextEncoder.encode / decodeUtf8.',
  },
  {
    re: /:\s*Buffer\b|<Buffer>/,
    label: 'Buffer type annotation',
    why: 'Use Uint8Array. tsc passes via ambient Node types but runtime has no Buffer in sandboxed renderer.',
  },
  {
    re: /\bNodeJS\.[A-Z]/,
    label: 'NodeJS.* ambient type',
    why: 'tsc passes but no runtime value. Use string / number / built-in DOM types.',
  },
  {
    re: /\bprocess\.(env|cwd|platform|arch|argv|exit|nextTick)\b/,
    label: 'process.* (Node global)',
    why: 'Renderer process partial-polyfills these. For env: ask user via Settings + dataStore. For platform: use navigator.platform.',
  },
  {
    re: /\b__dirname\b/,
    label: '__dirname',
    why: 'ESM/renderer has no __dirname. Use import.meta.url + new URL(...).pathname if absolutely needed.',
  },
  {
    re: /\b__filename\b/,
    label: '__filename',
    why: 'Same as __dirname — use import.meta.url.',
  },
  {
    re: /\.toString\s*\(\s*['"]utf-?8['"]/i,
    label: ".toString('utf-8')",
    why: "Buffer-only API. On Uint8Array gives '104,105,...'. Use util/web-crypto-helpers decodeUtf8 or new TextDecoder('utf-8').decode(bytes).",
  },
];

/** Walk src/ collecting eligible files. */
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      if (!INCLUDE_EXT.has(extname(name))) continue;
      if (EXCLUDE_FILE.test(name)) continue;
      yield full;
    }
  }
}

const hits = [];
let filesScanned = 0;

for (const file of walk(SRC)) {
  filesScanned++;
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip comment-only lines that mention the pattern in docs
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        hits.push({
          file: relative(ROOT, file),
          line: i + 1,
          label: p.label,
          why: p.why,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
}

if (hits.length === 0) {
  console.log(`[check-web-compat] OK — scanned ${filesScanned} files, 0 sandboxed-renderer incompat hits.`);
  process.exit(0);
}

console.error(`[check-web-compat] FAIL — ${hits.length} hit(s) across ${filesScanned} files:`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  [${h.label}]`);
  console.error(`    ${h.snippet}`);
  console.error(`    → ${h.why}`);
}
console.error(`
Fix: replace the flagged code with Web-API equivalents (see "→" hint),
or move the file under src/__tests__/ if it's Node-only test fixture.
`);
process.exit(1);
