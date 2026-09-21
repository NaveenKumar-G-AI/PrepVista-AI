import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { LanguageAdapter } from "./types";

/**
 * Adapters translate "run this source code" into a concrete
 * interpreter invocation. Adding a language means adding an
 * adapter here — hidden test *content* never changes per language.
 */

export const pythonAdapter: LanguageAdapter = {
  id: "python3",
  displayName: "Python 3",
  async prepare(workDir, sourceCode) {
    const rel = "main.py";
    await writeFile(path.join(workDir, rel), sourceCode, { mode: 0o644 });
    return { interpreter: "python3", scriptRelPath: rel };
  },
};

export const nodeAdapter: LanguageAdapter = {
  id: "node",
  displayName: "Node.js",
  async prepare(workDir, sourceCode) {
    const rel = "main.js";
    await writeFile(path.join(workDir, rel), sourceCode, { mode: 0o644 });
    return { interpreter: "node", scriptRelPath: rel };
  },
};

export const ADAPTERS: Record<string, LanguageAdapter> = {
  python3: pythonAdapter,
  python: pythonAdapter,
  node: nodeAdapter,
  javascript: nodeAdapter,
};

export function getAdapter(language: string): LanguageAdapter {
  const adapter = ADAPTERS[language.toLowerCase()];
  if (!adapter) {
    const supported = [...new Set(Object.values(ADAPTERS).map((a) => a.id))].join(", ");
    throw new Error(
      `Unsupported language "${language}". This deployment supports: ${supported}. ` +
        `Adding a language means adding an adapter in lib/sandbox/adapters.ts — hidden test content is unaffected.`
    );
  }
  return adapter;
}
