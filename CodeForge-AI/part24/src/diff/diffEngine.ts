import { structuredPatch } from 'diff';
import type { DiffRegion, SourceFile } from '../domain/types';

/**
 * Computes changed regions between two revisions, file by file.
 * This is the foundation of the "diff-first" architecture: everything
 * downstream (analyzers, findings, re-review) operates on these regions
 * rather than re-scanning whole files blindly.
 */
export function computeDiffRegions(baseFiles: SourceFile[], targetFiles: SourceFile[]): DiffRegion[] {
  const regions: DiffRegion[] = [];
  const baseMap = new Map(baseFiles.map((f) => [f.path, f.content]));
  const targetMap = new Map(targetFiles.map((f) => [f.path, f.content]));
  const allPaths = new Set([...baseMap.keys(), ...targetMap.keys()]);

  for (const path of allPaths) {
    const before = baseMap.get(path) ?? '';
    const after = targetMap.get(path) ?? '';
    if (before === after) continue;

    const patch = structuredPatch(path, path, before, after, '', '', { context: 3 });
    for (const hunk of patch.hunks) {
      const beforeLines: string[] = [];
      const afterLines: string[] = [];
      let hasAdd = false;
      let hasRemove = false;

      for (const line of hunk.lines) {
        if (line.startsWith('\\')) continue; // "\ No newline at end of file" — not real content
        const marker = line[0];
        const text = line.slice(1);
        if (marker === '+') {
          afterLines.push(text);
          hasAdd = true;
        } else if (marker === '-') {
          beforeLines.push(text);
          hasRemove = true;
        } else {
          beforeLines.push(text);
          afterLines.push(text);
        }
      }

      const kind: DiffRegion['kind'] = hasAdd && hasRemove ? 'modified' : hasAdd ? 'added' : 'removed';

      regions.push({
        file: path,
        kind,
        beforeStart: hunk.oldStart,
        beforeEnd: hunk.oldStart + Math.max(hunk.oldLines - 1, 0),
        afterStart: hunk.newStart,
        afterEnd: hunk.newStart + Math.max(hunk.newLines - 1, 0),
        beforeSnippet: beforeLines.join('\n'),
        afterSnippet: afterLines.join('\n'),
      });
    }
  }

  return regions;
}

export function summarizeDiff(regions: DiffRegion[]): { filesChanged: number; linesChanged: number } {
  const files = new Set(regions.map((r) => r.file));
  const linesChanged = regions.reduce((sum, r) => {
    const added = r.afterSnippet ? r.afterSnippet.split('\n').length : 0;
    const removed = r.beforeSnippet ? r.beforeSnippet.split('\n').length : 0;
    return sum + Math.max(added, removed);
  }, 0);
  return { filesChanged: files.size, linesChanged };
}
