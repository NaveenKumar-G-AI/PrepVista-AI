import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface CodeQualityResult {
  score: number | null; // 0..1, null if not measurable for this language
  maintainability_index: number | null; // radon's 0-100 scale
  cyclomatic_complexity: number | null;
  note: string;
}

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.on('error', () => resolve({ stdout, stderr, code: 1 }));
  });
}

/**
 * Real static analysis via `radon` (a real, independently-maintained
 * Python tool — not an in-house heuristic and not an LLM opinion). Scores
 * maintainability index (0-100, radon's own scale) and reports average
 * cyclomatic complexity. Section 40: "do not turn personal stylistic
 * preferences into mandatory failures" — this never fails a submission by
 * itself; it's one more scored dimension alongside correctness, not a gate.
 *
 * Python only in this reference build. A real deployment would add
 * language-appropriate tools per language (e.g. a JVM complexity tool for
 * Java, cppcheck/clang-tidy for C++) behind the same function signature.
 */
export async function assessCodeQuality(language: string, code: string): Promise<CodeQualityResult> {
  if (language !== 'python') {
    return {
      score: null,
      maintainability_index: null,
      cyclomatic_complexity: null,
      note: 'Static code-quality scoring is implemented for Python only in this reference build (via radon) — not measured for this submission\'s language.',
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-quality-'));
  const file = path.join(dir, `sol_${randomUUID()}.py`);
  fs.writeFileSync(file, code, 'utf8');

  try {
    const mi = await run('radon', ['mi', file, '-s']);
    const cc = await run('radon', ['cc', file, '-s', '-a']);

    const miMatch = mi.stdout.match(/\(([\d.]+)\)/);
    const maintainability = miMatch ? parseFloat(miMatch[1]) : null;

    const ccMatch = cc.stdout.match(/Average complexity:\s*\w+\s*\(([\d.]+)\)/);
    const avgComplexity = ccMatch ? parseFloat(ccMatch[1]) : null;

    const score = maintainability !== null ? Math.max(0, Math.min(1, maintainability / 100)) : null;

    return {
      score,
      maintainability_index: maintainability,
      cyclomatic_complexity: avgComplexity,
      note:
        maintainability !== null
          ? `radon maintainability index ${maintainability.toFixed(1)}/100${
              avgComplexity !== null ? `, average cyclomatic complexity ${avgComplexity.toFixed(1)}` : ''
            }.`
          : 'Could not parse radon output for this submission (it may not be syntactically valid Python).',
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
