export interface ExecutionLimits {
  /** Wall-clock limit in milliseconds. */
  timeMs: number;
  /** Virtual memory limit in megabytes. */
  memoryMb: number;
  /** Max captured stdout, in kilobytes. Excess is truncated and flagged. */
  outputKb: number;
  /** Max number of processes/threads the candidate may hold at once. */
  pidsLimit?: number;
}

export type SandboxOutcome =
  | "ok"
  | "timeout"
  | "memory_exceeded"
  | "output_exceeded"
  | "runtime_error"
  | "compile_error"
  | "system_error";

export interface ExecutionResult {
  outcome: SandboxOutcome;
  stdout: string;
  /** Short, sanitized diagnostic — never the full stderr (avoids leaking paths/host details). */
  stderrSummary: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  execTimeMs: number;
  truncatedOutput: boolean;
}

export interface LanguageAdapter {
  id: string;
  displayName: string;
  /** Writes candidate source into workDir and returns the interpreter invocation. */
  prepare(workDir: string, sourceCode: string): Promise<{
    interpreter: string;
    scriptRelPath: string;
    extraArgs?: string[];
  }>;
}
