import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appPool, servicePool, withStudentScope, withServiceScope, closePools } from "../lib/db.js";
import { genId } from "../lib/ids.js";
import { createStudent } from "../repositories/studentRepository.js";
import { upsertSkill } from "../repositories/skillRepository.js";
import { createEvidence, listEvidenceForSkill } from "../repositories/masteryEvidenceRepository.js";
import { submitQuestionEvidence, recomputeAndPersistMasteryState } from "../services/masteryEvidenceService.js";
import { getMasteryState } from "../repositories/masteryStateRepository.js";
import { createQuestion } from "../repositories/questionRepository.js";

const hasDb = Boolean(process.env.DATABASE_URL && process.env.SERVICE_DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("Postgres RLS isolation (live database)", () => {
  const studentA = { id: genId(), email: `rls_a_${Date.now()}@test.local` };
  const studentB = { id: genId(), email: `rls_b_${Date.now()}@test.local` };
  const skillId = genId();
  let evidenceIdA: string;
  let evidenceIdB: string;

  beforeAll(async () => {
    await withServiceScope(async (client) => {
      await createStudent(client, { id: studentA.id, email: studentA.email, passwordHash: "x", name: "RLS Test A" });
      await createStudent(client, { id: studentB.id, email: studentB.email, passwordHash: "x", name: "RLS Test B" });
      await upsertSkill(client, { id: skillId, key: `rls-test-skill-${Date.now()}`, name: "RLS Test Skill", category: "Test" });
    });

    evidenceIdA = genId();
    evidenceIdB = genId();
    await withServiceScope(async (client) => {
      await createEvidence(client, { id: evidenceIdA, studentId: studentA.id, skillId, evidenceType: "PRACTICE", score: 0.9, difficulty: 0.5, timed: false, contextType: "LABELED", noveltyLevel: "FAMILIAR", source: "TEST" });
      await createEvidence(client, { id: evidenceIdB, studentId: studentB.id, skillId, evidenceType: "PRACTICE", score: 0.4, difficulty: 0.5, timed: false, contextType: "LABELED", noveltyLevel: "FAMILIAR", source: "TEST" });
    });
  });

  afterAll(async () => {
    await withServiceScope(async (client) => {
      await client.query("DELETE FROM mastery_evidence WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM mastery_state WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM mastery_history_events WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM signal_outbox WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM skills WHERE id = $1", [skillId]);
      await client.query("DELETE FROM students WHERE id = ANY($1)", [[studentA.id, studentB.id]]);
    });
  });

  it("a session with NO student scope set sees zero rows (fails closed, not open)", async () => {
    const client = await appPool.connect();
    try {
      const { rows } = await client.query("SELECT id FROM mastery_evidence WHERE skill_id = $1", [skillId]);
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it("student A, scoped, sees only their own evidence row", async () => {
    const rows = await withStudentScope(studentA.id, (client) => listEvidenceForSkill(client, studentA.id, skillId));
    expect(rows.map((r) => r.id)).toEqual([evidenceIdA]);
  });

  it("student A, scoped to themselves, cannot read student B's row even by exact id", async () => {
    const result = await withStudentScope(studentA.id, async (client) => {
      const { rows } = await client.query("SELECT id FROM mastery_evidence WHERE id = $1", [evidenceIdB]);
      return rows;
    });
    expect(result).toHaveLength(0);
  });

  it("student A, scoped to themselves, cannot UPDATE student B's row", async () => {
    await withStudentScope(studentA.id, async (client) => {
      const { rowCount } = await client.query("UPDATE mastery_evidence SET score = 0.01 WHERE id = $1", [evidenceIdB]);
      expect(rowCount).toBe(0);
    });
    // Confirm via the service pool (bypasses RLS) that B's row is untouched.
    const untouched = await withServiceScope(async (client) => {
      const { rows } = await client.query("SELECT score FROM mastery_evidence WHERE id = $1", [evidenceIdB]);
      return rows[0];
    });
    expect(Number(untouched.score)).toBeCloseTo(0.4);
  });

  it("a WITH CHECK violation (inserting a row under someone else's student_id) is rejected, not silently reassigned", async () => {
    await expect(
      withStudentScope(studentA.id, async (client) => {
        await client.query(
          `INSERT INTO mastery_evidence (id, student_id, skill_id, evidence_type, score, difficulty, timed, context_type, novelty_level, source)
           VALUES ($1, $2, $3, 'PRACTICE', 0.5, 0.5, false, 'LABELED', 'FAMILIAR', 'TEST')`,
          [genId(), studentB.id, skillId]
        );
      })
    ).rejects.toThrow();
  });
});

describeIfDb("evidence -> mastery state pipeline (live database)", () => {
  const student = { id: genId(), email: `pipeline_${Date.now()}@test.local` };
  const skillId = genId();

  beforeAll(async () => {
    await withServiceScope(async (client) => {
      await createStudent(client, { id: student.id, email: student.email, passwordHash: "x", name: "Pipeline Test" });
      await upsertSkill(client, { id: skillId, key: `pipeline-test-skill-${Date.now()}`, name: "Pipeline Test Skill", category: "Test" });
    });
  });

  afterAll(async () => {
    await withServiceScope(async (client) => {
      await client.query("DELETE FROM question_exposures WHERE question_id IN (SELECT id FROM questions WHERE skill_id = $1)", [skillId]);
      await client.query("DELETE FROM mastery_evidence WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM mastery_state WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM mastery_history_events WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM signal_outbox WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM questions WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM skills WHERE id = $1", [skillId]);
      await client.query("DELETE FROM students WHERE id = $1", [student.id]);
    });
  });

  it("recomputes and persists mastery_state, and writes a history event, from real evidence rows", async () => {
    await withServiceScope(async (client) => {
      for (const score of [0.9, 0.92, 0.95]) {
        await createEvidence(client, { id: genId(), studentId: student.id, skillId, evidenceType: "PRACTICE", score, difficulty: 0.5, timed: false, contextType: "LABELED", noveltyLevel: "FAMILIAR", source: "TEST" });
      }
    });

    const outcome = await withStudentScope(student.id, (client) => recomputeAndPersistMasteryState(client, student.id, skillId));
    expect(outcome.decision.state).toBe("PROVISIONALLY_MASTERED");
    expect(outcome.stateChanged).toBe(true);

    const persisted = await withStudentScope(student.id, (client) => getMasteryState(client, student.id, skillId));
    expect(persisted?.state).toBe("PROVISIONALLY_MASTERED");
  });

  it("submitQuestionEvidence records exposure, evidence, and recomputes state through the real question path", async () => {
    const question = await withServiceScope((client) =>
      createQuestion(client, {
        id: genId(),
        skillId,
        formGroupId: genId(),
        prompt: "Integration test question - what is 2+2?",
        choices: [{ id: "a", text: "3" }, { id: "b", text: "4" }, { id: "c", text: "5" }, { id: "d", text: "6" }],
        correctAnswer: "b",
        explanation: "2+2=4.",
        difficulty: 0.1,
        noveltyLevel: "NOVEL",
        contextType: "MIXED_CONTEXT",
        expectedTimeSeconds: 20,
        generatedBy: "SEED",
        qualityStatus: "APPROVED",
      })
    );

    const outcome = await withStudentScope(student.id, (client) =>
      submitQuestionEvidence(client, {
        studentId: student.id,
        skillId,
        questionId: question.id,
        wasCorrect: true,
        score: 1,
        evidenceType: "TRANSFER",
        difficulty: 0.1,
        timed: false,
        contextType: "MIXED_CONTEXT",
        noveltyLevel: "NOVEL",
        source: "TEST",
      })
    );

    expect(outcome.decision.evidenceCounts.novel).toBeGreaterThanOrEqual(1);
  });
});

describeIfDb("question selection does not duplicate a question within one plan (regression)", () => {
  // This is a real bug the demo walkthrough script caught: question_exposures
  // is only written when a question is ANSWERED, not when it's merely
  // selected into a plan, so building a multi-question plan by calling the
  // selector once per slot with no other exclusion returned the SAME
  // earliest-created question for every slot at that novelty level - which
  // then got flagged MEMORIZATION_RISK by the second/third submission
  // within the very session meant to verify transfer, silently corrupting
  // its own evidence count. See excludeQuestionIds in questionRepository.ts.
  const skillId = genId();

  beforeAll(async () => {
    await withServiceScope(async (client) => {
      await upsertSkill(client, { id: skillId, key: `dup-test-skill-${Date.now()}`, name: "Duplicate Selection Test Skill", category: "Test" });
      for (let i = 0; i < 2; i++) {
        await createQuestion(client, {
          id: genId(),
          skillId,
          formGroupId: genId(),
          prompt: `Duplicate-selection regression question #${i}`,
          choices: [{ id: "a", text: "x" }, { id: "b", text: "y" }],
          correctAnswer: "a",
          explanation: "n/a",
          difficulty: 0.5,
          noveltyLevel: "NOVEL",
          contextType: "MIXED_CONTEXT",
          expectedTimeSeconds: 30,
          generatedBy: "SEED",
          qualityStatus: "APPROVED",
        });
      }
    });
  });

  afterAll(async () => {
    await withServiceScope(async (client) => {
      await client.query("DELETE FROM questions WHERE skill_id = $1", [skillId]);
      await client.query("DELETE FROM skills WHERE id = $1", [skillId]);
    });
  });

  it("selecting two NOVEL questions in a row for the same never-seen student returns two DISTINCT questions", async () => {
    const { selectQuestionForVerification } = await import("../services/questionVariationService.js");
    const studentId = genId();
    const selectedIds: string[] = [];

    const first = await withServiceScope((client) =>
      selectQuestionForVerification(client, { studentId, skillId, skillKey: "dup-test", skillName: "Duplicate Selection Test Skill", noveltyLevel: "NOVEL", contextType: "MIXED_CONTEXT", excludeQuestionIds: selectedIds })
    );
    selectedIds.push(first.id);

    const second = await withServiceScope((client) =>
      selectQuestionForVerification(client, { studentId, skillId, skillKey: "dup-test", skillName: "Duplicate Selection Test Skill", noveltyLevel: "NOVEL", contextType: "MIXED_CONTEXT", excludeQuestionIds: selectedIds })
    );

    expect(second.id).not.toBe(first.id);
  });
});

afterAll(async () => {
  if (hasDb) await closePools();
});
