import { db } from "../db/client";
import { ConfidenceCalibration, Difficulty, MasteryState } from "../domain/enums";
import { SkillPracticeState } from "../domain/types";

function rowToState(row: any): SkillPracticeState {
  return {
    studentId: row.student_id,
    skillId: row.skill_id,
    lastPracticed: row.last_practiced,
    attemptCount: row.attempt_count,
    correctCount: row.correct_count,
    recentAccuracy: row.recent_accuracy,
    averageTimeSeconds: row.average_time_seconds,
    confidenceCalibration: row.confidence_calibration as ConfidenceCalibration,
    errorDistribution: JSON.parse(row.error_distribution),
    difficultyExposure: JSON.parse(row.difficulty_exposure),
    hintUsageRate: row.hint_usage_rate,
    streak: row.streak,
    masteryState: row.mastery_state as MasteryState,
    nextReview: row.next_review,
    currentDifficulty: row.current_difficulty,
    suspectedMemorization: !!row.suspected_memorization,
  };
}

export const SkillStateRepository = {
  get(studentId: string, skillId: string): SkillPracticeState | null {
    const row = db
      .prepare(`SELECT * FROM skill_practice_state WHERE student_id = ? AND skill_id = ?`)
      .get(studentId, skillId) as any;
    return row ? rowToState(row) : null;
  },

  getAllForStudent(studentId: string): SkillPracticeState[] {
    const rows = db.prepare(`SELECT * FROM skill_practice_state WHERE student_id = ?`).all(studentId) as any[];
    return rows.map(rowToState);
  },

  getOrCreate(studentId: string, skillId: string): SkillPracticeState {
    const existing = this.get(studentId, skillId);
    if (existing) return existing;
    const fresh: SkillPracticeState = {
      studentId,
      skillId,
      lastPracticed: null,
      attemptCount: 0,
      correctCount: 0,
      recentAccuracy: 0,
      averageTimeSeconds: 0,
      confidenceCalibration: ConfidenceCalibration.UNKNOWN,
      errorDistribution: {},
      difficultyExposure: {},
      hintUsageRate: 0,
      streak: 0,
      masteryState: MasteryState.NOT_STARTED,
      nextReview: null,
      currentDifficulty: Difficulty.EASY,
      suspectedMemorization: false,
    };
    this.save(fresh);
    return fresh;
  },

  save(state: SkillPracticeState) {
    db.prepare(
      `INSERT INTO skill_practice_state
         (student_id, skill_id, last_practiced, attempt_count, correct_count, recent_accuracy,
          average_time_seconds, confidence_calibration, error_distribution, difficulty_exposure,
          hint_usage_rate, streak, mastery_state, next_review, current_difficulty, suspected_memorization)
       VALUES (@studentId, @skillId, @lastPracticed, @attemptCount, @correctCount, @recentAccuracy,
          @averageTimeSeconds, @confidenceCalibration, @errorDistribution, @difficultyExposure,
          @hintUsageRate, @streak, @masteryState, @nextReview, @currentDifficulty, @suspectedMemorization)
       ON CONFLICT(student_id, skill_id) DO UPDATE SET
          last_practiced=excluded.last_practiced, attempt_count=excluded.attempt_count,
          correct_count=excluded.correct_count, recent_accuracy=excluded.recent_accuracy,
          average_time_seconds=excluded.average_time_seconds, confidence_calibration=excluded.confidence_calibration,
          error_distribution=excluded.error_distribution, difficulty_exposure=excluded.difficulty_exposure,
          hint_usage_rate=excluded.hint_usage_rate, streak=excluded.streak, mastery_state=excluded.mastery_state,
          next_review=excluded.next_review, current_difficulty=excluded.current_difficulty,
          suspected_memorization=excluded.suspected_memorization`
    ).run({
      ...state,
      errorDistribution: JSON.stringify(state.errorDistribution),
      difficultyExposure: JSON.stringify(state.difficultyExposure),
      suspectedMemorization: state.suspectedMemorization ? 1 : 0,
    });
  },
};
