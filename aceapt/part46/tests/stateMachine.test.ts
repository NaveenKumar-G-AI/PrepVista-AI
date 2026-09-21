import { describe, expect, it } from "vitest";
import { transition } from "../src/domain/stateMachine";
import { StudentThinkingState } from "../src/domain/types";

const limits = { maxHintLevel: 6, maxTurnsPerState: 4, maxLoopBacks: 2 };

function baseThinking(overrides: Partial<StudentThinkingState> = {}): StudentThinkingState {
  return {
    objective: "identify_base_value_for_percentage_change",
    targetSkill: "QUANT.PERCENTAGES",
    currentStep: "x",
    understandingState: "not_understood",
    responseState: null,
    misconception: null,
    hintLevel: 0,
    consecutiveHints: 0,
    consecutiveIncorrect: 0,
    independence: "not_yet",
    confidenceSelfReport: null,
    turnsInCurrentState: 0,
    totalTurns: 0,
    achievedCriteria: [],
    usedHintThisProblem: false,
    ...overrides,
  };
}

describe("state machine", () => {
  it("moves from IDENTIFICATION to CHECKPOINT then INDEPENDENT_ATTEMPT on correct reasoning", () => {
    const r1 = transition({
      state: "IDENTIFICATION",
      classification: "CORRECT_REASONING",
      controlIntent: null,
      thinkingState: baseThinking(),
      limits,
    });
    expect(r1.nextState).toBe("CHECKPOINT");

    const r2 = transition({
      state: "CHECKPOINT",
      classification: "CORRECT_REASONING",
      controlIntent: null,
      thinkingState: baseThinking(),
      limits,
    });
    expect(r2.nextState).toBe("INDEPENDENT_ATTEMPT");
  });

  it("routes a detected misconception to MISCONCEPTION_CHECK from any active reasoning state", () => {
    const fromIdentification = transition({
      state: "IDENTIFICATION",
      classification: "MISCONCEPTION",
      controlIntent: null,
      thinkingState: baseThinking(),
      limits,
    });
    expect(fromIdentification.nextState).toBe("MISCONCEPTION_CHECK");

    const fromGuided = transition({
      state: "GUIDED_REASONING",
      classification: "MISCONCEPTION",
      controlIntent: null,
      thinkingState: baseThinking(),
      limits,
    });
    expect(fromGuided.nextState).toBe("MISCONCEPTION_CHECK");

    // Regression: these three used to have no misconception branch of their
    // own and would silently fall through to their default case instead.
    for (const s of ["HINT", "INDEPENDENT_ATTEMPT", "TRANSFER_VERIFICATION"] as const) {
      const result = transition({
        state: s,
        classification: "MISCONCEPTION",
        controlIntent: null,
        thinkingState: baseThinking(),
        limits,
      });
      expect(result.nextState).toBe("MISCONCEPTION_CHECK");
    }
  });

  it("escalates hints progressively and never loops forever", () => {
    let state: "GUIDED_REASONING" | "HINT" = "GUIDED_REASONING";
    let hintLevel = 0;
    const seenStates: string[] = [];

    for (let i = 0; i < 20; i++) {
      const result = transition({
        state,
        classification: "INCORRECT",
        controlIntent: null,
        thinkingState: baseThinking({ hintLevel: hintLevel as any }),
        limits,
      });
      seenStates.push(result.nextState);
      if (result.nextState === "PARTIAL_EXPLANATION") break;
      if (result.nextState === "HINT") hintLevel = Math.min(6, hintLevel + 1);
      state = result.nextState as "GUIDED_REASONING" | "HINT";
    }

    expect(seenStates[seenStates.length - 1]).toBe("PARTIAL_EXPLANATION");
    expect(seenStates.length).toBeLessThan(20); // proves it terminated, not an infinite loop
  });

  it("never traps the student in PARTIAL_EXPLANATION's teach-back check, but allows one retry first", () => {
    const first = transition({
      state: "PARTIAL_EXPLANATION",
      classification: "INCORRECT",
      controlIntent: null,
      thinkingState: baseThinking({ turnsInCurrentState: 1 }),
      limits,
    });
    expect(first.nextState).toBe("PARTIAL_EXPLANATION");

    const second = transition({
      state: "PARTIAL_EXPLANATION",
      classification: "INCORRECT",
      controlIntent: null,
      thinkingState: baseThinking({ turnsInCurrentState: 2 }),
      limits,
    });
    expect(second.nextState).toBe("INDEPENDENT_ATTEMPT");
  });

  it("does not mark mastery on a failed transfer attempt - routes back to guided reasoning first", () => {
    const result = transition({
      state: "TRANSFER_VERIFICATION",
      classification: "INCORRECT",
      controlIntent: null,
      thinkingState: baseThinking({ consecutiveIncorrect: 0 }),
      limits,
    });
    expect(result.nextState).toBe("GUIDED_REASONING");
  });

  it("escalates to a human/ESCALATED after repeated independent-attempt failure instead of looping forever", () => {
    const result = transition({
      state: "INDEPENDENT_ATTEMPT",
      classification: "INCORRECT",
      controlIntent: null,
      thinkingState: baseThinking({ consecutiveIncorrect: 2 }),
      limits,
    });
    expect(result.nextState).toBe("ESCALATED");
  });

  it("honors an explicit 'explain directly' request from the student", () => {
    const result = transition({
      state: "GUIDED_REASONING",
      classification: "INCORRECT",
      controlIntent: "explain_directly",
      thinkingState: baseThinking(),
      limits,
    });
    expect(result.nextState).toBe("PARTIAL_EXPLANATION");
  });
});
