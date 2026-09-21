import type {
  ApplicationType,
  ConfidenceLevel,
  Question,
  QuestionPresentation,
  QuestionPurpose,
  ResponseRecord,
  ResponseStatus,
} from "@/lib/domain/types";
import type { JoinedAttempt } from "@/lib/db/repo";

/** Builds a fully-formed JoinedAttempt without touching the database — for unit-testing the domain layer in isolation. */
export function makeAttempt(input: {
  questionId: string;
  skillNodeId: string;
  applicationType: ApplicationType;
  difficulty: 1 | 2 | 3 | 4;
  purpose: QuestionPurpose;
  correct: boolean | null;
  status?: ResponseStatus;
  sequenceIndex: number;
  estimatedTimeSeconds?: number;
  responseDurationMs?: number;
  confidence?: ConfidenceLevel | null;
}): JoinedAttempt {
  const question: Question = {
    id: input.questionId,
    version: 1,
    skillNodeId: input.skillNodeId,
    applicationType: input.applicationType,
    difficulty: input.difficulty,
    questionType: "MCQ",
    questionText: "test question",
    options: ["A", "B"],
    correctAnswer: "A",
    explanation: "test explanation",
    expectedReasoning: null,
    commonErrorTypes: [],
    skillTags: ["test"],
    estimatedTimeSeconds: input.estimatedTimeSeconds ?? 60,
    validationStatus: "VALIDATED",
    validationNotes: null,
    sourceType: "HUMAN_AUTHORED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const presentation: QuestionPresentation = {
    id: `pres_${input.sequenceIndex}`,
    sessionId: "sess_test",
    questionId: input.questionId,
    purpose: input.purpose,
    rationale: "test rationale",
    sequenceIndex: input.sequenceIndex,
    captureConfidence: !!input.confidence,
    presentedAt: "2026-01-01T00:00:00.000Z",
  };

  const status = input.status ?? "ANSWERED";
  const response: ResponseRecord = {
    id: `resp_${input.sequenceIndex}`,
    sessionId: "sess_test",
    presentationId: presentation.id,
    questionId: input.questionId,
    status,
    studentAnswer: status === "ANSWERED" ? (input.correct ? "A" : "B") : null,
    isCorrect: status === "ANSWERED" ? input.correct : null,
    confidenceLevel: input.confidence ?? null,
    questionStartedAt: "2026-01-01T00:00:00.000Z",
    questionAnsweredAt: "2026-01-01T00:00:01.000Z",
    responseDurationMs: input.responseDurationMs ?? 60_000,
    createdAt: "2026-01-01T00:00:01.000Z",
  };

  return { response, presentation, question };
}
