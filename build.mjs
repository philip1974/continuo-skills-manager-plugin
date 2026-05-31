#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ENTRY = 'src/main.ts';
const OUTFILE = 'dist/main.js';

const result = await esbuild.build({
  entryPoints: [ENTRY],
  outfile: OUTFILE,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'zod',
  ],
  metafile: true,
  minify: false,
  sourcemap: true,
  logLevel: 'info',
});

const outMeta = result.metafile.outputs[OUTFILE];
if (!outMeta) {
  throw new Error(`bundle assertion L1 fail: no output metadata for ${OUTFILE}`);
}

const ALLOWED_HOST = new Set(['react', 'react-dom', 'zod']);
const isAllowedHost = (path) =>
  ALLOWED_HOST.has(path) || path.startsWith('react/');

const forbidden = outMeta.imports.filter(
  (item) => !isAllowedHost(item.path),
);
if (forbidden.length > 0) {
  const list = forbidden
    .map((item) => `  ${item.path} (kind=${item.kind}, external=${item.external ?? false})`)
    .join('\n');
  throw new Error(
    `bundle assertion L1 fail: ${OUTFILE} has ${forbidden.length} forbidden external imports (only react/react-dom/zod allowed):\n${list}`,
  );
}

const allowed = outMeta.imports.filter((item) => isAllowedHost(item.path));
if (allowed.length > 0) {
  console.log(
    `[build] L1 PASS - ${allowed.length} allowed externals: ${allowed.map((item) => item.path).join(', ')}`,
  );
}

const out = await readFile(OUTFILE, 'utf-8');
const patterns = [
  /(?:^|\n)\s*import\s+(?:[^'"\n]*\s+from\s+)?['"][^.\/'"][^'"]*['"]/,
  /(?:^|\n)\s*(?:const|let|var)?\s*[^=\n]*=\s*require\s*\(\s*['"][^.\/'"][^'"]*['"]/,
  /\brequire\s*\(\s*['"][^.\/'"][^'"]*['"]/,
  /\bimport\s*\(\s*['"][^.\/'"][^'"]*['"]/,
];
const isAllowedBareLine = (line) =>
  /['"](?:react(?:\/[^'"]+)?|react-dom|zod)['"]/.test(line);
const hits = patterns
  .map((pattern) =>
    Array.from(out.matchAll(new RegExp(pattern.source, 'gm'))).map((match) =>
      match[0].trim(),
    ),
  )
  .flat()
  .filter((line) => !isAllowedBareLine(line));

if (hits.length > 0) {
  throw new Error(
    `bundle assertion L2 fail: ${OUTFILE} contains forbidden bare imports/requires:\n${hits.join('\n')}`,
  );
}

await writeFile(`${OUTFILE}.meta.json`, JSON.stringify(result.metafile, null, 2));

async function jsOutputs(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await jsOutputs(fullPath));
    } else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

const nodeImportHits = [];
for (const file of await jsOutputs('dist')) {
  const text = await readFile(file, 'utf-8');
  const matches = [
    ...text.matchAll(/from\s+['"]node:[^'"]+['"]/g),
    ...text.matchAll(/import\s*\(\s*['"]node:[^'"]+['"]\s*\)/g),
    ...text.matchAll(/require\s*\(\s*['"]node:[^'"]+['"]\s*\)/g),
  ];
  for (const match of matches) {
    nodeImportHits.push(`${file}: ${match[0]}`);
  }
}

if (nodeImportHits.length > 0) {
  throw new Error(
    `bundle assertion L3 fail: dist contains node:* imports/requires:\n${nodeImportHits.join('\n')}`,
  );
}

console.log(`[build] ${OUTFILE} OK - 0 forbidden imports`);
console.log('Build OK');
