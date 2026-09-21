/**
 * Minimal structural equality — no lodash/etc. available offline, and a
 * hand-rolled ~20 lines is more auditable than a dependency for something
 * this security-sensitive (it decides pass/fail on student submissions).
 */
export function deepEqual(a: unknown, b: unknown, mode: "exact" | "unordered_collection" = "exact"): boolean {
  if (mode === "unordered_collection" && Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const bCopy = [...b];
    for (const itemA of a) {
      const idx = bCopy.findIndex((itemB) => deepEqual(itemA, itemB, "exact"));
      if (idx === -1) return false;
      bCopy.splice(idx, 1);
    }
    return true;
  }

  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i], mode));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) => deepEqual((a as any)[k], (b as any)[k], mode));
  }

  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-9;
  }

  return false;
}
