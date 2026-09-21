/**
 * CodeForge — Mistake Classification (§27) & Misconception Detection (§28)
 *
 * Deterministic and rule-based on purpose (§14: "a policy engine rather than
 * hidden entirely inside an LLM"). Every rule below is driven by something
 * the execution actually produced — the real exception type/message from the
 * harness, or the real pattern of which test categories failed — never a
 * guess. AI coaching (src/ai/*) may add qualitative commentary on top, but it
 * does not get a vote on which MistakeCategory values are recorded as
 * evidence; that stays deterministic so it's auditable and reproducible.
 */

import { MistakeCategory, TestCategory, type MisconceptionRecord, type MistakeEvidence, type TestResult } from "../domain/types";

export function classifyMistakes(testResults: TestResult[]): MistakeCategory[] {
  const failed = testResults.filter((r) => !r.passed);
  if (failed.length === 0) return [];

  const categories = new Set<MistakeCategory>();

  for (const f of failed) {
    if (f.errorKind === "resource_limit") {
      categories.add(MistakeCategory.COMPLEXITY_FAILURE);
      continue;
    }
    if (f.errorKind === "runtime_error" || f.errorKind === "compile_error") {
      const msg = (f.errorMessage ?? "").toLowerCase();
      if (msg.includes("indexerror") || msg.includes("index out of range")) {
        categories.add(MistakeCategory.BOUNDARY_ERROR);
      } else if (msg.includes("keyerror")) {
        categories.add(MistakeCategory.WRONG_DATA_STRUCTURE);
      } else if (msg.includes("typeerror")) {
        categories.add(MistakeCategory.TYPE_ERROR);
      } else if (msg.includes("attributeerror")) {
        categories.add(MistakeCategory.WRONG_DATA_STRUCTURE);
      } else if (msg.includes("nonetype") || msg.includes("none")) {
        categories.add(MistakeCategory.NULL_HANDLING);
      } else if (msg.includes("recursionerror") || msg.includes("maximum recursion")) {
        categories.add(MistakeCategory.COMPLEXITY_FAILURE);
      } else if (msg.includes("zerodivisionerror")) {
        categories.add(MistakeCategory.LOGIC_ERROR);
      } else if (msg.includes("nameerror")) {
        categories.add(MistakeCategory.LOGIC_ERROR);
      } else if (msg.includes("syntaxerror") || msg.includes("indentationerror")) {
        categories.add(MistakeCategory.RUNTIME_ERROR);
      } else {
        categories.add(MistakeCategory.RUNTIME_ERROR);
      }
      continue;
    }
    if (f.errorKind === "system_error") {
      // Platform failure, not student evidence — deliberately not classified as a mistake.
      continue;
    }
    // else: a plain value mismatch, handled in aggregate below (pattern needs the full set)
  }

  const valueMismatches = failed.filter((f) => !f.errorKind);
  if (valueMismatches.length > 0) {
    const normalTestsPassed = testResults.some((r) => r.passed && r.category === TestCategory.NORMAL);
    const allMismatchesAreEdgeLike = valueMismatches.every(
      (f) => f.category === TestCategory.EDGE || f.category === TestCategory.BOUNDARY,
    );
    if (normalTestsPassed && allMismatchesAreEdgeLike) {
      // Handles the core scenario but not the edges — the classic off-by-one signature.
      categories.add(MistakeCategory.OFF_BY_ONE);
      categories.add(MistakeCategory.BOUNDARY_ERROR);
    } else if (valueMismatches.some((f) => f.category === TestCategory.NEGATIVE)) {
      categories.add(MistakeCategory.INPUT_HANDLING);
    } else {
      // Wrong on the main scenario too — points at the approach, not an edge case.
      categories.add(MistakeCategory.WRONG_ALGORITHM);
      categories.add(MistakeCategory.LOGIC_ERROR);
    }
  }

  return categories.size > 0 ? Array.from(categories) : [MistakeCategory.UNKNOWN];
}

/**
 * §28 — do not flag a misconception from a single mistake. Confidence grows
 * with repetition: 1 occurrence stays unflagged, 2 is LOW, 3 is MEDIUM
 * (matching the exact example in the spec), 4+ is HIGH.
 */
export function updateMisconceptions(
  existing: MisconceptionRecord[],
  studentId: string,
  skill: string,
  category: MistakeCategory,
  evidence: MistakeEvidence,
  timestamp: string,
): MisconceptionRecord[] {
  if (category === MistakeCategory.UNKNOWN) return existing;

  const idx = existing.findIndex((m) => m.studentId === studentId && m.skill === skill && m.category === category);
  if (idx === -1) {
    // First occurrence — tracked, but not yet a "misconception" (needs repetition to earn that label).
    return [
      ...existing,
      {
        studentId,
        skill,
        category,
        occurrences: 1,
        confidence: "LOW",
        evidence: [evidence],
        firstSeen: timestamp,
        lastSeen: timestamp,
      },
    ];
  }

  const updated = [...existing];
  const record = updated[idx]!;
  const occurrences = record.occurrences + 1;
  const confidence: MisconceptionRecord["confidence"] = occurrences >= 4 ? "HIGH" : occurrences === 3 ? "MEDIUM" : "LOW";
  updated[idx] = {
    ...record,
    occurrences,
    confidence,
    evidence: [...record.evidence, evidence].slice(-10),
    lastSeen: timestamp,
  };
  return updated;
}

/** Misconceptions worth surfacing to the selection engine / a coach — occurrences >= 2. */
export function activeMisconceptions(records: MisconceptionRecord[], studentId: string, skill?: string): MisconceptionRecord[] {
  return records.filter((m) => m.studentId === studentId && m.occurrences >= 2 && (!skill || m.skill === skill));
}
