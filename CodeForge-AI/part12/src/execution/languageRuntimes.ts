/**
 * CodeForge AI — Submission System
 * Language runtime registry for the LOCAL DEV execution provider only. CodeForge's real
 * multi-language support (whatever list it already has) lives wherever the real sandbox
 * defines it — this file exists so the demonstration/test provider has somewhere single
 * and explicit to declare the handful of languages it can actually run in this sandbox
 * environment (which has python3, node, gcc, g++ preinstalled and no network to fetch
 * others). Adding a language here is one entry, not a scattered set of if/else branches.
 */

export interface LanguageRuntime {
  language: string;
  version: string;
  needsCompile: boolean;
  /**
   * Some runtimes reserve large virtual address space at startup regardless of what the
   * program actually does — V8 reserves ~1GB+ for its CodeRange before a single line of
   * user JS runs, unrelated to actual heap usage. `ulimit -v` caps virtual address space,
   * not resident memory, so it cannot tell "reserved but unused" apart from "actually
   * used." Below this floor, the runtime itself fails to start — which is a platform
   * failure (JUDGE_ERROR / an execution-layer problem), not evidence the student's
   * program used too much memory. This floor is applied ONLY to the ulimit -v value
   * passed to the shell; the student-facing memoryLimitKb (and the /proc-measured RSS
   * used for real MLE classification) is never changed by it. See
   * localProcessExecutionProvider.ts, spawnWithLimits' caller in run().
   */
  minimumVirtualMemoryFloorKb?: number;
  compileCommand?: (mainPath: string, outPath: string) => { cmd: string; args: string[] };
  runCommand: (mainPath: string, compiledArtifactPath: string | undefined) => { cmd: string; args: string[] };
}

export const LANGUAGE_RUNTIMES: Record<string, LanguageRuntime> = {
  'python:3.12': {
    language: 'python',
    version: '3.12',
    needsCompile: false,
    runCommand: (mainPath) => ({ cmd: 'python3', args: [mainPath] }),
  },
  'javascript:node22': {
    language: 'javascript',
    version: 'node22',
    needsCompile: false,
    // Measured empirically in this sandbox: node fails with a fatal V8 CodeRange
    // reservation OOM below ~1GB of ulimit -v, completely independent of the script's
    // actual memory use (a bare `console.log` script fails identically to a heavy one).
    // 1.5M KB gives safety margin above the ~1M KB observed minimum across environments.
    minimumVirtualMemoryFloorKb: 1_500_000,
    runCommand: (mainPath) => ({ cmd: 'node', args: [mainPath] }),
  },
  'c:gcc13': {
    language: 'c',
    version: 'gcc13',
    needsCompile: true,
    compileCommand: (mainPath, outPath) => ({ cmd: 'gcc', args: [mainPath, '-O2', '-Wall', '-o', outPath] }),
    runCommand: (_mainPath, artifact) => ({ cmd: artifact ?? '', args: [] }),
  },
  'cpp:g++13': {
    language: 'cpp',
    version: 'g++13',
    needsCompile: true,
    compileCommand: (mainPath, outPath) => ({ cmd: 'g++', args: [mainPath, '-O2', '-std=c++17', '-Wall', '-o', outPath] }),
    runCommand: (_mainPath, artifact) => ({ cmd: artifact ?? '', args: [] }),
  },
};

export class UnsupportedRuntimeError extends Error {
  constructor(language: string, version: string) {
    super(`UNSUPPORTED_RUNTIME: no local dev execution runtime registered for ${language}@${version}`);
    this.name = 'UnsupportedRuntimeError';
  }
}

export function resolveRuntime(language: string, version: string): LanguageRuntime {
  const runtime = LANGUAGE_RUNTIMES[`${language}:${version}`];
  if (!runtime) throw new UnsupportedRuntimeError(language, version);
  return runtime;
}
