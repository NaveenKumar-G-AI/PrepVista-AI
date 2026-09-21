import { withStudentContext } from "../db/pool.js";
import { getAttemptBySequence } from "../db/repositories/attemptRepo.js";
import { getInterventionType } from "../policy/interventionMapping.js";
import { track } from "./analytics.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { InterventionType } from "../types/errorTaxonomy.js";

/** §37/§65 — a small set of domain-specific reasonableness checks. Extend this table as new question domains are added. */
export type ReasonablenessCheck = "PROBABILITY_RANGE" | "PERCENTAGE_RANGE" | "MAGNITUDE_SANITY" | "SIGN_CHECK" | "UNIT_CHECK";

export interface ReasonablenessResult {
  correct: boolean;
  prompt: string;
  explanation: string;
}

const CHECKS: Record<ReasonablenessCheck, { prompt: string; evaluate: (value: number) => boolean; explainFail: string }> = {
  PROBABILITY_RANGE: {
    prompt: "Can a probability exceed 1?",
    evaluate: (v) => v < 0 || v > 1, // "should this trigger a flag" — true means the value IS out of range
    explainFail: "A probability must stay between 0 and 1 — this result is outside that range, so the setup needs a revisit."
  },
  PERCENTAGE_RANGE: {
    prompt: "Does this percentage fall in a realistic range for the question?",
    evaluate: (v) => v < 0 || v > 100,
    explainFail: "This percentage falls outside 0–100, which isn't possible for this kind of question."
  },
  MAGNITUDE_SANITY: {
    prompt: "Before submitting: does this result seem reasonable given the numbers in the problem?",
    evaluate: () => false, // magnitude sanity has no fixed numeric rule; caller supplies the verdict via studentSaysFlag
    explainFail: "Worth a second look before submitting."
  },
  SIGN_CHECK: {
    prompt: "Does the sign of this result make sense for what's being asked?",
    evaluate: (v) => v < 0,
    explainFail: "A negative value doesn't fit what this question is asking for."
  },
  UNIT_CHECK: {
    prompt: "Are the units in the final answer consistent with what the question asked for?",
    evaluate: () => false,
    explainFail: "Double-check the units carried through the calculation."
  }
};

export class SelfCorrectionService {
  /**
   * §37/§65 — given a numeric result and a domain check, tells the student
   * whether their own "should I flag this?" judgment (studentSaysFlag)
   * matches reality. The actual out-of-range determination is deterministic
   * (§100) — never AI-judged.
   */
  checkReasonableness(
    studentId: string,
    check: ReasonablenessCheck,
    resultValue: number,
    studentSaysFlag: boolean
  ): ReasonablenessResult {
    const spec = CHECKS[check];
    const shouldFlag = spec.evaluate(resultValue);
    const correct = studentSaysFlag === shouldFlag;
    track("self_correction_started", { studentId, check });
    if (correct && shouldFlag) track("self_correction_success", { studentId, check });
    return {
      correct,
      prompt: spec.prompt,
      explanation: shouldFlag
        ? spec.explainFail
        : "This value is within a reasonable range — good to submit."
    };
  }

  /** §23/§66/§122 — "Find the first error." Deterministic: compares against the attempt's recorded first_error_step. */
  async submitErrorSpotting(
    studentId: string,
    sessionId: string,
    sequenceNumber: number,
    studentSelectedStep: number
  ): Promise<{ correct: boolean; correctStep: number | null }> {
    track("error_spotting_started", { studentId, sessionId, sequenceNumber });
    return withStudentContext(studentId, async (client) => {
      const attempt = await getAttemptBySequence(client, sessionId, sequenceNumber);
      if (!attempt) throw new NotFoundError(`attempt ${sequenceNumber} in session ${sessionId}`);
      if (attempt.firstErrorStep == null) {
        throw new ValidationError("This attempt has no recorded step breakdown to spot an error in.");
      }
      const correct = studentSelectedStep === attempt.firstErrorStep;
      if (correct) track("error_spotting_success", { studentId, sessionId, sequenceNumber });
      return { correct, correctStep: attempt.firstErrorStep };
    });
  }

  /**
   * §24 — "Show an incorrect solution. Ask: What went wrong? How would you
   * correct it?" Implemented as a deterministic multiple-choice check
   * against the fix category (§100: correctness must never be AI-judged),
   * rather than free-text grading.
   */
  async submitErrorCorrectionChoice(
    studentId: string,
    sessionId: string,
    sequenceNumber: number,
    studentSelectedFix: InterventionType
  ): Promise<{ correct: boolean; correctFix: InterventionType }> {
    return withStudentContext(studentId, async (client) => {
      const attempt = await getAttemptBySequence(client, sessionId, sequenceNumber);
      if (!attempt) throw new NotFoundError(`attempt ${sequenceNumber} in session ${sessionId}`);
      if (!attempt.errorType) {
        throw new ValidationError("This attempt was correct — there's no error to diagnose a fix for.");
      }
      const correctFix = getInterventionType(attempt.errorType);
      const correct = studentSelectedFix === correctFix;
      if (correct) track("error_correction_success", { studentId, sessionId, sequenceNumber });
      return { correct, correctFix };
    });
  }
}
