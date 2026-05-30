import { Project, SyntaxKind } from 'ts-morph';

const FORBIDDEN_IMPORTS = ['node:fs', 'node:child_process', 'fs', 'child_process'];

const FORBIDDEN_CALLS = [
  { pattern: /^fs\.(rm|cp)$/, requireOpts: /recursive/, msg: 'fs.rm/cp with recursive: true' },
  { pattern: /^fs\.renameSync$/, msg: 'fs.renameSync (cross-dir hazard)' },
  { pattern: /^fs\.unlinkSync$/, msg: 'fs.unlinkSync' },
  { pattern: /^fs\.readFileSync$/, msg: 'fs.readFileSync (use app.fs.readFile)' },
];

const project = new Project({ tsConfigFilePath: './tsconfig.json' });
const violations: string[] = [];

for (const src of project.getSourceFiles('src/**/*.ts')) {
  if (
    src.getFilePath().includes('/trust/safe-fs.ts') ||
    src.getFilePath().includes('/util/exec-stream-helper.ts')
  ) {
    continue;
  }

  for (const imp of src.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue();
    if (FORBIDDEN_IMPORTS.includes(mod)) {
      violations.push(`${src.getFilePath()}: forbidden import "${mod}"`);
    }
  }

  for (const call of src.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression().getText();
    for (const rule of FORBIDDEN_CALLS) {
      if (!rule.pattern.test(expr)) continue;
      const text = call.getText();
      if (rule.requireOpts && !rule.requireOpts.test(text)) continue;
      violations.push(`${src.getFilePath()}: ${rule.msg}`);
    }
  }
}

if (violations.length > 0) {
  console.error('[trust-gates] VIOLATIONS:');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('[trust-gates] OK');
