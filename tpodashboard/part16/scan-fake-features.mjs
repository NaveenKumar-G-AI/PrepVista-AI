#!/usr/bin/env node
// PrepVista AI — fake/demo/synthetic-data sweep (Part 16 §35–36)
//
// CLI:        node scripts/scan-fake-features.mjs <path> [--include-tests]
// Importable: import { scanDirectory } from './scan-fake-features.mjs'
//
// Heuristic first pass, not a verdict — every hit needs a human to decide
// "legitimate" vs "still fake." It will not catch a hardcoded KPI that
// avoids these literal words.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.rb', '.go', '.java', '.php']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);
const TEST_DIR_HINT = /(^|\/)(__mocks__|__fixtures__|test|tests|spec|specs|fixtures|seeds?)(\/|$)/i;

const PATTERNS = [
  [/Math\.random\s*\(/, 'Math.random — non-deterministic value in what may be production code'],
  [/\bfaker\b/i, 'faker — fixture-generation library referenced outside fixtures'],
  [/\bmock(ed|ing)?\b/i, '"mock" marker'],
  [/\bdemo\b/i, '"demo" marker'],
  [/\bsample\b/i, '"sample" marker'],
  [/\bseed(ed|ing)?\b/i, '"seed" marker'],
  [/\bhardcoded\b/i, 'explicit "hardcoded" comment'],
  [/\bfake\s*(ai|alert|forecast|application|interview|offer|joining|data)\b/i, '"fake <thing>" marker — §36'],
  [/\bTODO\b.*\b(fake|stub|placeholder|not\s+real)\b/i, 'TODO admitting placeholder behavior'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXT.has(extname(name))) out.push(full);
  }
  return out;
}

function scanFile(path, includeTests) {
  const isTestPath = TEST_DIR_HINT.test(path.replace(/\\/g, '/'));
  if (isTestPath && !includeTests) return { path, skipped: true, hits: [] };
  const lines = readFileSync(path, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const [re, label] of PATTERNS) {
      if (re.test(line)) hits.push({ line: i + 1, label, text: line.trim().slice(0, 140) });
    }
  });
  return { path, skipped: false, hits };
}

export async function scanDirectory(root, { includeTests = false } = {}) {
  const files = walk(root);
  const perFile = files.map((f) => scanFile(f, includeTests));
  const withHits = perFile.filter((r) => r.hits.length > 0);
  const totalHits = withHits.reduce((n, r) => n + r.hits.length, 0);
  return { root, filesScanned: files.length, filesWithHits: withHits.length, totalHits, results: withHits };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  const includeTests = args.includes('--include-tests');
  const report = await scanDirectory(root, { includeTests });
  for (const r of report.results) {
    console.log(`\n${r.path}`);
    for (const h of r.hits) {
      console.log(`  L${h.line}  ${h.label}`);
      console.log(`        ${h.text}`);
    }
  }
  console.log(`\n${report.totalHits} hit(s) across ${report.filesWithHits} file(s) (${report.filesScanned} scanned, test/fixture paths skipped unless --include-tests).`);
  console.log('Triage each one against §36: does the feature actually do what it claims once this line is fixed?');
}
