import { randomUUID } from 'node:crypto';
import { detectSuspiciousPattern } from '../domain/antiGaming.js';
import type { Difficulty, EvidenceSource } from '../domain/types.js';
import { EvidenceRepository } from '../repositories/EvidenceRepository.js';
import { getPool } from '../repositories/db.js';
import { MasteryService } from './MasteryService.js';

export interface CompletePracticeInput {
  studentId: string;
  skillId: string;
  problemId: string | null;
  source: EvidenceSource;
  difficulty: Difficulty;
  independent: boolean;
  hintsUsed: number;
  solutionViewed: boolean;
  isTransfer: boolean;
  timed: boolean;
  passed: boolean;
  failureReason?: string;
  idempotencyKey: string;
}

export class PracticeService {
  constructor(
    private evidenceRepo = new EvidenceRepository(),
    private masteryService = new MasteryService()
  ) {}

  async startSession(studentId: string, skillId: string, problemId: string | null, mode: string) {
    const pool = getPool();
    const { rows } = await pool.query(
      `insert into practice_sessions (student_id, skill_id, problem_id, mode) values ($1,$2,$3,$4) returning id`,
      [studentId, skillId, problemId, mode]
    );
    return rows[0].id as string;
  }

  /**
   * PHASE 50: the one place a real submission enters the system. Records
   * evidence (idempotently), flags — but does not reject — suspicious
   * patterns, then triggers a scoped recalculation (this skill only, not
   * the whole graph — PHASE 51/79).
   */
  async completePractice(input: CompletePracticeInput) {
    const recent = input.problemId ? await this.evidenceRepo.listRecentForStudent(input.studentId, 50) : [];
    const suspicion = detectSuspiciousPattern(
      { problemId: input.problemId, createdAt: new Date().toISOString() },
      recent.map((e) => ({ problemId: e.problemId, createdAt: e.createdAt }))
    );

    const evidence = await this.evidenceRepo.insert({
      studentId: input.studentId,
      skillId: input.skillId,
      problemId: input.problemId,
      source: input.source,
      difficulty: input.difficulty,
      independent: input.independent,
      hintsUsed: input.hintsUsed,
      solutionViewed: input.solutionViewed,
      isTransfer: input.isTransfer,
      timed: input.timed,
      passed: input.passed,
      failureReason: input.failureReason as any,
      suspicious: suspicion.suspicious,
      suspiciousReason: suspicion.reason,
      idempotencyKey: input.idempotencyKey,
    });

    // null means the idempotency key was already used — this is a safe
    // no-op retry, not an error (PHASE 70).
    if (!evidence) {
      return { evidence: null, mastery: await this.masteryService.getState(input.studentId, input.skillId) };
    }

    const mastery = await this.masteryService.recalculate(input.studentId, input.skillId);
    return { evidence, mastery };
  }

  newIdempotencyKey(): string {
    return randomUUID();
  }
}
