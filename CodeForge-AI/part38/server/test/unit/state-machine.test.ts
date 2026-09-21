import { describe, expect, it } from "vitest";
import { ReportLifecycleStatus as S } from "../../src/domain/enums";
import { assertValidTransition, InvalidReportTransitionError, isTerminal } from "../../src/domain/state-machine";

describe("report lifecycle state machine (brief §12)", () => {
  it("allows the full happy path", () => {
    expect(() => assertValidTransition(S.REQUESTED, S.QUEUED)).not.toThrow();
    expect(() => assertValidTransition(S.QUEUED, S.GENERATING)).not.toThrow();
    expect(() => assertValidTransition(S.GENERATING, S.VALIDATING)).not.toThrow();
    expect(() => assertValidTransition(S.VALIDATING, S.COMPLETED)).not.toThrow();
  });

  it("allows failure from GENERATING and from VALIDATING", () => {
    expect(() => assertValidTransition(S.GENERATING, S.FAILED)).not.toThrow();
    expect(() => assertValidTransition(S.VALIDATING, S.FAILED)).not.toThrow();
  });

  it("allows cancellation only before processing starts", () => {
    expect(() => assertValidTransition(S.REQUESTED, S.CANCELLED)).not.toThrow();
    expect(() => assertValidTransition(S.QUEUED, S.CANCELLED)).not.toThrow();
    expect(() => assertValidTransition(S.GENERATING, S.CANCELLED)).toThrow(InvalidReportTransitionError);
  });

  it("rejects skipping states", () => {
    expect(() => assertValidTransition(S.REQUESTED, S.GENERATING)).toThrow(InvalidReportTransitionError);
    expect(() => assertValidTransition(S.QUEUED, S.COMPLETED)).toThrow(InvalidReportTransitionError);
    expect(() => assertValidTransition(S.REQUESTED, S.COMPLETED)).toThrow(InvalidReportTransitionError);
  });

  it("rejects any transition out of terminal states", () => {
    for (const terminal of [S.COMPLETED, S.FAILED, S.CANCELLED]) {
      expect(isTerminal(terminal)).toBe(true);
      for (const target of Object.values(S)) {
        expect(() => assertValidTransition(terminal, target)).toThrow(InvalidReportTransitionError);
      }
    }
  });

  it("rejects backwards transitions", () => {
    expect(() => assertValidTransition(S.GENERATING, S.QUEUED)).toThrow(InvalidReportTransitionError);
    expect(() => assertValidTransition(S.VALIDATING, S.GENERATING)).toThrow(InvalidReportTransitionError);
  });
});
