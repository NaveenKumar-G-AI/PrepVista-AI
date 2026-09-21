import { describe, it, expect } from "vitest";
import {
  detectTrialAndError,
  nextCoachingLevel,
  resetCoachingLevel,
  advanceCoachingProgression,
} from "../src/domain/coaching-progression.js";
import { CoachingLevel, CoachingMode, StudentActionEvent } from "../src/types.js";

function actions(types: StudentActionEvent["type"][]): StudentActionEvent[] {
  return types.map((type, i) => ({ id: `a${i}`, type, at: new Date(i).toISOString() }));
}

describe("detectTrialAndError (Section 17)", () => {
  it("does not flag a normal small number of edit/run cycles", () => {
    const r = detectTrialAndError(actions(["EDIT_CODE", "RUN_CODE"]));
    expect(r.detected).toBe(false);
  });

  it("flags repeated edit/run cycles with no hypothesis or guidance activity", () => {
    const r = detectTrialAndError(
      actions(["EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE"])
    );
    expect(r.detected).toBe(true);
    expect(r.message).toBeDefined();
    // must not be accusatory (Section 17)
    expect(r.message!.toLowerCase()).not.toMatch(/you keep guessing|stop guessing|random(ly)?/);
  });

  it("does not flag the same edit/run volume once hypothesis activity is present", () => {
    const r = detectTrialAndError(
      actions(["EDIT_CODE", "RUN_CODE", "CREATE_HYPOTHESIS", "EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE"])
    );
    expect(r.detected).toBe(false);
  });

  it("does not flag it once the student has engaged the coach", () => {
    const r = detectTrialAndError(
      actions(["EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE", "REQUEST_GUIDANCE", "EDIT_CODE", "RUN_CODE"])
    );
    expect(r.detected).toBe(false);
  });
});

describe("nextCoachingLevel (Sections 34-35)", () => {
  it("stays at the current level while stuck-signal count is below threshold", () => {
    expect(nextCoachingLevel(CoachingLevel.QUESTION, CoachingMode.SOCRATIC, 1)).toBe(CoachingLevel.QUESTION);
  });

  it("escalates one rung once the stuck threshold is reached", () => {
    expect(nextCoachingLevel(CoachingLevel.QUESTION, CoachingMode.SOCRATIC, 2)).toBe(CoachingLevel.DIRECTION);
  });

  it("never escalates past the mode's ceiling, even with a huge stuck count", () => {
    // INTERVIEW's ceiling is DIRECTION — must never reach TARGETED_HINT or beyond.
    expect(nextCoachingLevel(CoachingLevel.DIRECTION, CoachingMode.INTERVIEW, 50)).toBe(CoachingLevel.DIRECTION);
    expect(nextCoachingLevel(CoachingLevel.QUESTION, CoachingMode.INTERVIEW, 50)).toBe(CoachingLevel.DIRECTION);
  });

  it("clamps down immediately if the current level is above the mode's ceiling", () => {
    // e.g. mode switched to INTERVIEW mid-session while already at SPECIFIC_GUIDANCE
    expect(nextCoachingLevel(CoachingLevel.SPECIFIC_GUIDANCE, CoachingMode.INTERVIEW, 0)).toBe(CoachingLevel.DIRECTION);
  });

  it("LEARNING mode can reach the top of the ladder", () => {
    expect(nextCoachingLevel(CoachingLevel.ROOT_CAUSE_EXPLANATION, CoachingMode.LEARNING, 2)).toBe(
      CoachingLevel.SOLUTION_EXPLANATION
    );
  });
});

describe("resetCoachingLevel", () => {
  it("resets to OBSERVATION for every mode", () => {
    for (const mode of Object.values(CoachingMode)) {
      expect(resetCoachingLevel(mode)).toBe(CoachingLevel.OBSERVATION);
    }
  });
});

describe("advanceCoachingProgression", () => {
  it("fully resets the stuck counter when progress was made", () => {
    const result = advanceCoachingProgression(
      { coachingLevel: CoachingLevel.DIRECTION, coachingMode: CoachingMode.SOCRATIC, stuckSignalCount: 1 },
      { newHypothesisOrStatusChange: true, newEvidenceCaptured: false, phaseChanged: false }
    );
    expect(result).toEqual({ coachingLevel: CoachingLevel.DIRECTION, stuckSignalCount: 0 });
  });

  it("increments the stuck counter and escalates once threshold is crossed, then resets the counter", () => {
    const step1 = advanceCoachingProgression(
      { coachingLevel: CoachingLevel.QUESTION, coachingMode: CoachingMode.SOCRATIC, stuckSignalCount: 0 },
      { newHypothesisOrStatusChange: false, newEvidenceCaptured: false, phaseChanged: false }
    );
    expect(step1).toEqual({ coachingLevel: CoachingLevel.QUESTION, stuckSignalCount: 1 });

    const step2 = advanceCoachingProgression(
      { coachingLevel: step1.coachingLevel, coachingMode: CoachingMode.SOCRATIC, stuckSignalCount: step1.stuckSignalCount },
      { newHypothesisOrStatusChange: false, newEvidenceCaptured: false, phaseChanged: false }
    );
    expect(step2.coachingLevel).toBe(CoachingLevel.DIRECTION);
    expect(step2.stuckSignalCount).toBe(0);
  });
});
