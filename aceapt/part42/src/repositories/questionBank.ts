import type { Pool } from "pg";
import type { DiagnosticQuestion, QuestionDifficulty } from "../types/domain.js";
import type { QuestionBankPort } from "../types/contracts.js";

export class InMemoryQuestionBank implements QuestionBankPort {
  private questions: DiagnosticQuestion[] = [];

  seed(questions: DiagnosticQuestion[]) {
    this.questions.push(...questions);
  }

  async getById(questionId: string) {
    return this.questions.find((q) => q.id === questionId) ?? null;
  }

  async getCandidatesForSkill(skillNodeId: string, difficulty?: QuestionDifficulty) {
    return this.questions.filter(
      (q) => q.skillNodeId === skillNodeId && q.qualityStatus !== "retired" && (!difficulty || q.difficulty === difficulty),
    );
  }
}

/** Reads the _fixture_questions stand-in table — see db/migrations/001 header.
 * Not per-student data, so a plain grant (already applied in 002) is enough;
 * no SECURITY DEFINER function needed here. */
export class PostgresQuestionBank implements QuestionBankPort {
  constructor(private pool: Pool) {}

  private mapRow(r: any): DiagnosticQuestion {
    return {
      id: r.id,
      domain: r.domain,
      topic: r.topic,
      subtopic: r.subtopic,
      skillNodeId: r.skill_node_id,
      difficulty: r.difficulty,
      expectedTimeMs: r.expected_time_ms,
      questionType: r.question_type,
      concept: r.concept ?? undefined,
      qualityStatus: r.quality_status,
    };
  }

  async getById(questionId: string) {
    const { rows } = await this.pool.query("select * from _fixture_questions where id = $1", [questionId]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getCandidatesForSkill(skillNodeId: string, difficulty?: QuestionDifficulty) {
    const { rows } = await this.pool.query(
      `select * from _fixture_questions
        where skill_node_id = $1 and quality_status != 'retired'
          and ($2::question_difficulty is null or difficulty = $2)`,
      [skillNodeId, difficulty ?? null],
    );
    return rows.map((r) => this.mapRow(r));
  }
}
