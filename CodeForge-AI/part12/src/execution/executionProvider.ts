/**
 * CodeForge AI — Submission System
 * The execution provider seam. src/worker/worker.ts depends only on this interface,
 * never on LocalProcessExecutionProvider directly — so wiring in CodeForge's real,
 * existing secure sandbox (Docker/Firecracker/isolate/gVisor/Judge0/whatever it already
 * runs) means writing one new class here and flipping EXECUTION_PROVIDER in .env; it
 * does not touch the state machine, queue, validation, DTOs, or DB layer at all.
 */
import type { ExecutionConfig } from '../domain/types.js';

export interface ExecutionFile {
  path: string;
  content: string;
}

export interface CompileInput {
  files: ExecutionFile[];
  mainPath: string;
  language: string;
  languageVersion: string;
  config: ExecutionConfig;
  workDir: string;
}

export interface CompileResult {
  status: 'NOT_REQUIRED' | 'SUCCESS' | 'FAILED';
  sanitizedOutput: string;
  durationMs: number;
  artifactPath?: string;
}

export interface RunInput {
  files: ExecutionFile[];
  mainPath: string;
  language: string;
  languageVersion: string;
  config: ExecutionConfig;
  workDir: string;
  stdin: string;
  compileArtifactPath?: string;
}

export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  wallMs: number;
  cpuMs: number;
  memoryKb: number;
  timedOut: boolean;
  outOfMemory: boolean;
  outputTruncated: boolean;
}

export interface ExecutionProvider {
  readonly name: string;
  compile(input: CompileInput): Promise<CompileResult>;
  run(input: RunInput): Promise<RunResult>;
}
