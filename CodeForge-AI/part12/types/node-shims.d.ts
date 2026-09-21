/**
 * Hand-rolled ambient declarations for the Node.js APIs this project actually calls.
 * @types/node is not installable in this sandbox (no network egress — see
 * ENGINEERING_REPORT.md, "What ran vs what's blocked"). tsx transpiles and runs .ts
 * without needing these at all (it strips types, it doesn't check them), so this file
 * exists purely to make `tsc --noEmit` a meaningful quality gate. It is deliberately
 * scoped to only what's used — if the codebase ever calls a Node API not declared
 * below, tsc will correctly fail rather than silently passing. Delete this file the
 * moment the real @types/node is installed in the host repo; nothing here should be
 * imported by application code.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
    argv: string[];
    exitCode: number | undefined;
    platform: string;
    cwd(): string;
    exit(code?: number): never;
    kill(pid: number, signal?: string): boolean;
  }
}
declare const process: NodeJS.Process;

declare class Buffer {
  static byteLength(input: string, encoding?: string): number;
  static from(input: string, encoding?: string): Buffer;
  toString(encoding?: string): string;
  length: number;
}

declare module 'node:crypto' {
  export function randomUUID(): string;
  export interface Hash {
    update(data: string, inputEncoding?: string): Hash;
    digest(encoding: 'hex' | 'base64'): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:assert/strict' {
  interface AssertStatic {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    fail(message?: string): never;
    match(value: string, regex: RegExp, message?: string): void;
    throws(fn: () => unknown, errorOrMatcher?: unknown, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    rejects(promiseOrFn: Promise<unknown> | (() => Promise<unknown>), errorOrMatcher?: unknown, message?: string): Promise<void>;
  }
  const assert: AssertStatic;
  export default assert;
}

declare module 'node:child_process' {
  export interface ChildProcessEvents {
    on(event: 'close', listener: (code: number | null, signal: string | null) => void): void;
    on(event: 'error', listener: (err: Error) => void): void;
  }
  export interface ReadableLike {
    on(event: 'data', listener: (chunk: Buffer) => void): void;
  }
  export interface WritableLike {
    write(chunk: string): boolean;
    end(): void;
  }
  export interface ChildProcess extends ChildProcessEvents {
    stdout: ReadableLike | null;
    stderr: ReadableLike | null;
    stdin: WritableLike | null;
    pid: number | undefined;
    kill(signal?: string): boolean;
  }
  export interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: string | string[];
    shell?: boolean | string;
    detached?: boolean;
  }
  export function spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function writeFile(path: string, data: string, encoding?: string): Promise<void>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function chmod(path: string, mode: number | string): Promise<void>;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
}

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
