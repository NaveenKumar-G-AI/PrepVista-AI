import { describe, it, expect } from "vitest";
import {
  computeErrorLifecycle,
  detectErrorClusters,
  classifyRecurrenceStatus
} from "../../src/domain/errorClassification.js";
import type { AttemptRecord } from "../../src/types/accuracy.js";
import type { ErrorType } from "../../src/types/errorTaxonomy.js";

let seq = 0;
function attempt(overrides: Partial<AttemptRecord> & { minutesAgo: number }): AttemptRecord {
  seq++;
  const base: AttemptRecord = {
    id: `attempt-${seq}`,
    studentId: "student-1",
    sessionId: "session-1",
    questionId: `question-${seq}`,
    skillId: "skill-percentages",
    sequenceNumber: seq,
    isCorrect: true,
    firstErrorStep: null,
    stepResults: null,
    errorType: null,
    difficulty: "medium",
    isNovel: false,
    hintLevel: "independent",
    responseTimeMs: 30000,
    expectedTimeMs: 40000,
    selfCorrected: false,
    questionValid: true,
    sessionPositionPct: 50,
    createdAt: new Date(Date.now() - overrides.minutesAgo * 60_000).toISOString()
  };
  return { ...base, ...overrides };
}

function wrong(errorType: ErrorType, minutesAgo: number, extra: Partial<AttemptRecord> = {}): AttemptRecord {
  return attempt({ minutesAgo, isCorrect: false, errorType, ...extra });
}
function correct(minutesAgo: number, extra: Partial<AttemptRecord> = {}): AttemptRecord {
  return attempt({ minutesAgo, isCorrect: true, ...extra });
}

describe("computeErrorLifecycle", () => {
  it("§119 — a single occurrence is isolated, not recurring", () => {
    const history = [correct(100), wrong("STRATEGY_ERROR", 90), correct(80)];
    const lifecycle = computeErrorLifecycle(history, "STRATEGY_ERROR");
    const status = classifyRecurrenceStatus(lifecycle, false);
    expect(lifecycle.frequency).toBe(1);
    expect(status).toBe("isolated");
  });

  it("§119 — the same mistake appearing three times raises it to recurring", () => {
    const history = [
      wrong("STRATEGY_ERROR", 300),
      correct(280),
      wrong("STRATEGY_ERROR", 200),
      correct(180),
      wrong("STRATEGY_ERROR", 100)
    ];
    const lifecycle = computeErrorLifecycle(history, "STRATEGY_ERROR");
    expect(lifecycle.frequency).toBe(3);
    expect(classifyRecurrenceStatus(lifecycle, false)).toBe("recurring");
  });

  it("§120 — 3 prior errors then 5 independent successes resolves the pattern, without erasing frequency", () => {
    const history: AttemptRecord[] = [
      wrong("CALCULATION_ERROR", 600),
      wrong("CALCULATION_ERROR", 500),
      wrong("CALCULATION_ERROR", 400),
      correct(350, { hintLevel: "independent" }),
      correct(300, { hintLevel: "independent" }),
      correct(250, { hintLevel: "independent" }),
      correct(200, { hintLevel: "independent" }),
      correct(150, { hintLevel: "independent" })
    ];
    const lifecycle = computeErrorLifecycle(history, "CALCULATION_ERROR");
    expect(lifecycle.frequency).toBe(3); // §52 — history is never erased
    expect(lifecycle.successesSinceLastOccurrence).toBe(5);
    expect(classifyRecurrenceStatus(lifecycle, false)).toBe("resolved");
  });

  it("guided (non-independent) successes don't count toward resolution evidence", () => {
    const history: AttemptRecord[] = [
      wrong("CALCULATION_ERROR", 600),
      wrong("CALCULATION_ERROR", 500),
      wrong("CALCULATION_ERROR", 400),
      correct(350, { hintLevel: "guided" }),
      correct(300, { hintLevel: "guided" }),
      correct(250, { hintLevel: "guided" }),
      correct(200, { hintLevel: "guided" }),
      correct(150, { hintLevel: "guided" })
    ];
    const lifecycle = computeErrorLifecycle(history, "CALCULATION_ERROR");
    expect(lifecycle.successesSinceLastOccurrence).toBe(0);
    expect(classifyRecurrenceStatus(lifecycle, false)).not.toBe("resolved");
  });

  it("§121 — a resolved error that reappears is flagged as regressed, and full history is retained", () => {
    const history: AttemptRecord[] = [
      wrong("VERIFICATION_ERROR", 900),
      wrong("VERIFICATION_ERROR", 800),
      wrong("VERIFICATION_ERROR", 700),
      correct(650, { hintLevel: "independent" }),
      correct(600, { hintLevel: "independent" }),
      correct(550, { hintLevel: "independent" }),
      correct(500, { hintLevel: "independent" }),
      correct(450, { hintLevel: "independent" }), // resolved as of here
      wrong("VERIFICATION_ERROR", 100) // §52 — reappears
    ];
    const lifecycle = computeErrorLifecycle(history, "VERIFICATION_ERROR");
    expect(lifecycle.frequency).toBe(4); // history retained, not reset to 1
    expect(lifecycle.wasEverResolved).toBe(true);
    expect(classifyRecurrenceStatus(lifecycle, false)).toBe("regressed");
  });

  it("re-resolving after a regression reports resolved again, not stuck on regressed", () => {
    const history: AttemptRecord[] = [
      wrong("VERIFICATION_ERROR", 1500),
      wrong("VERIFICATION_ERROR", 1400),
      wrong("VERIFICATION_ERROR", 1300),
      correct(1250, { hintLevel: "independent" }),
      correct(1200, { hintLevel: "independent" }),
      correct(1150, { hintLevel: "independent" }),
      correct(1100, { hintLevel: "independent" }),
      correct(1050, { hintLevel: "independent" }), // resolved
      wrong("VERIFICATION_ERROR", 900), // regressed
      correct(800, { hintLevel: "independent" }),
      correct(700, { hintLevel: "independent" }),
      correct(600, { hintLevel: "independent" }),
      correct(500, { hintLevel: "independent" }),
      correct(400, { hintLevel: "independent" }) // re-resolved
    ];
    const lifecycle = computeErrorLifecycle(history, "VERIFICATION_ERROR");
    expect(classifyRecurrenceStatus(lifecycle, false)).toBe("resolved");
  });

  it("§122 — first-error localization: only the first failing step matters for classification input", () => {
    const stepResults = [
      { step: 1, correct: true },
      { step: 2, correct: true },
      { step: 3, correct: false },
      { step: 4, correct: false }
    ];
    const firstFailed = stepResults.find((s) => !s.correct);
    expect(firstFailed?.step).toBe(3);
  });

  it("§129 — invalid questions must be excluded before lifecycle tracking sees them", () => {
    const history: AttemptRecord[] = [
      wrong("CALCULATION_ERROR", 300),
      wrong("CALCULATION_ERROR", 200, { questionValid: false }), // invalid — caller must filter this out upstream
      wrong("CALCULATION_ERROR", 100)
    ];
    const validOnly = history.filter((a) => a.questionValid);
    const lifecycle = computeErrorLifecycle(validOnly, "CALCULATION_ERROR");
    expect(lifecycle.frequency).toBe(2);
  });
});

describe("detectErrorClusters", () => {
  it("§13 — several related error types recurring together form a cluster", () => {
    const history: AttemptRecord[] = [
      wrong("STRATEGY_ERROR", 100),
      wrong("STRATEGY_ERROR", 90),
      wrong("CALCULATION_ERROR", 80),
      wrong("CALCULATION_ERROR", 70),
      correct(60)
    ];
    const cluster = detectErrorClusters("skill-percentages", history);
    expect(cluster).not.toBeNull();
    expect(cluster?.memberErrorTypes.sort()).toEqual(["CALCULATION_ERROR", "STRATEGY_ERROR"]);
  });

  it("a single recurring error type alone is not a cluster", () => {
    const history: AttemptRecord[] = [
      wrong("STRATEGY_ERROR", 100),
      wrong("STRATEGY_ERROR", 90),
      wrong("STRATEGY_ERROR", 80)
    ];
    expect(detectErrorClusters("skill-percentages", history)).toBeNull();
  });
});
