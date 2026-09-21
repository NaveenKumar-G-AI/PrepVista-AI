/**
 * DEMO / SEED DATA ONLY (section 46: "No Fake Data").
 *
 * Synthetic events for a handful of fictional students, used to make the
 * prototype's intelligence visible end-to-end. Loaded only when
 * DEMO_MODE=true (default in .env.example; set to false in production).
 * Never presented as real student analytics - every demo student id is
 * prefixed `demo-` by convention, and nothing in the API special-cases
 * that prefix, so it's a labeling convention, not a code path that could
 * leak into production behavior.
 *
 * Every demo student's events are pushed through eventStore.append() -
 * the exact same path a real client's POST /api/events would use - so the
 * "intelligence" a reader sees in the demo is the real engine running on
 * this data, not separately hand-written UI copy.
 */
import { randomUUID } from 'crypto';
import { eventStore } from '../infrastructure/store';
import { BehaviorEvent, Difficulty } from '../types/events';

const IST_OFFSET_MINUTES = 330;

export function daysAgoIso(daysAgo: number, hourUtc = 13, minute = 0): string {
  const target = new Date(Date.now() - daysAgo * 86_400_000);
  target.setUTCHours(hourUtc, minute, 0, 0);
  return target.toISOString();
}

function ev(partial: Omit<BehaviorEvent, 'id' | 'timezoneOffsetMinutes'> & { timezoneOffsetMinutes?: number }): BehaviorEvent {
  return { id: randomUUID(), timezoneOffsetMinutes: IST_OFFSET_MINUTES, ...partial };
}

function buildSession(opts: {
  studentId: string;
  daysAgo: number;
  durationMinutes: number;
  questionCount: number;
  difficultyMix: Difficulty[];
  correctRate: number;
  hintRate: number;
  completed: boolean;
  planId?: string;
  topicId?: string;
}): BehaviorEvent[] {
  const { studentId, daysAgo, durationMinutes, questionCount, difficultyMix, correctRate, hintRate, completed, planId, topicId } = opts;
  const sessionId = `sess-${studentId}-${daysAgo}-${Math.round(Math.random() * 1e6)}`;
  const events: BehaviorEvent[] = [];
  events.push(ev({ studentId, type: 'SESSION_STARTED', occurredAtUtc: daysAgoIso(daysAgo, 13, 0), sessionId, planId }));

  const answeredCount = completed ? questionCount : Math.max(1, Math.round(questionCount * 0.55));
  for (let i = 0; i < answeredCount; i++) {
    const difficulty = difficultyMix[i % difficultyMix.length];
    const questionId = `q-${difficulty.toLowerCase()}-${(i % 6) + 1}`;
    const minuteOffset = Math.min(Math.max(durationMinutes - 1, 1), Math.round((i / questionCount) * durationMinutes));
    const correct = Math.random() < correctRate;
    const useHelp = Math.random() < hintRate;

    events.push(ev({ studentId, type: 'QUESTION_STARTED', occurredAtUtc: daysAgoIso(daysAgo, 13, minuteOffset), sessionId, questionId, difficulty, topicId }));
    if (useHelp) {
      events.push(ev({ studentId, type: 'HINT_REQUESTED', occurredAtUtc: daysAgoIso(daysAgo, 13, minuteOffset), sessionId, questionId, difficulty, topicId }));
    }
    events.push(ev({
      studentId, type: 'QUESTION_ANSWERED', occurredAtUtc: daysAgoIso(daysAgo, 13, minuteOffset),
      sessionId, questionId, difficulty, topicId, correct, questionDurationSeconds: 45 + Math.round(Math.random() * 60),
    }));
    if (!correct && Math.random() < 0.5) {
      events.push(ev({ studentId, type: 'RETRY_STARTED', occurredAtUtc: daysAgoIso(daysAgo, 13, minuteOffset), sessionId, questionId, difficulty, topicId }));
      events.push(ev({
        studentId, type: 'QUESTION_ANSWERED', occurredAtUtc: daysAgoIso(daysAgo, 13, minuteOffset),
        sessionId, questionId, difficulty, topicId, correct: Math.random() < correctRate + 0.2, questionDurationSeconds: 30,
      }));
    } else if (!completed && i === answeredCount - 1) {
      events.push(ev({ studentId, type: 'QUESTION_SKIPPED', occurredAtUtc: daysAgoIso(daysAgo, 13, minuteOffset), sessionId, questionId: `q-${difficulty.toLowerCase()}-${((i + 1) % 6) + 1}`, difficulty, topicId }));
    }
  }

  events.push(ev({
    studentId,
    type: completed ? 'SESSION_COMPLETED' : 'SESSION_ABANDONED',
    occurredAtUtc: daysAgoIso(daysAgo, 13, durationMinutes),
    sessionId,
    durationSeconds: durationMinutes * 60,
    progressFraction: completed ? 1 : round(answeredCount / questionCount),
    planId,
  }));

  return events;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function loadDemoData(): Promise<number> {
  const events: BehaviorEvent[] = [];

  // ============================================================
  // demo-arjun: the section-56 closed-loop story.
  // "Before": infrequent sessions that fall well short of the planned
  // 60-minute target (irregular attendance AND a real duration shortfall -
  // this is what PLAN_REALISM_MISMATCH is actually measuring, not just
  // "long sessions"). Day offsets are chosen with >=1 day of buffer around
  // every transition so the story is robust regardless of what hour this
  // script happens to run at (see runDemoStory.ts's matching beforeCutoff).
  // ============================================================
  events.push(ev({
    studentId: 'demo-arjun', type: 'PLAN_ACCEPTED', occurredAtUtc: daysAgoIso(35), planId: 'plan-arjun-1',
    plannedSessionMinutes: 60, metadata: { assignedQuestionsCount: 400 },
  }));
  const beforeDays = [23, 18, 14, 11];
  beforeDays.forEach((d, idx) => {
    events.push(...buildSession({
      studentId: 'demo-arjun', daysAgo: d, durationMinutes: 25, questionCount: 10,
      difficultyMix: ['EASY', 'EASY', 'EASY', 'MEDIUM'], correctRate: 0.55, hintRate: 0.35,
      completed: idx % 2 === 0, planId: 'plan-arjun-1', topicId: 'quant-percentages',
    }));
  });

  // Feature 7 (not owned by this repo - represented here only as the plan
  // event it would emit) reacts partway through: shorter session target.
  events.push(ev({
    studentId: 'demo-arjun', type: 'PLAN_MODIFIED', occurredAtUtc: daysAgoIso(9),
    planId: 'plan-arjun-2', plannedSessionMinutes: 20, metadata: { assignedQuestionsCount: 400 },
  }));

  // "After": short, frequent, consistent sessions, close to the new target.
  const afterDays = [8, 7, 6, 5, 4, 3, 2, 1, 0];
  afterDays.forEach((d) => {
    events.push(...buildSession({
      studentId: 'demo-arjun', daysAgo: d, durationMinutes: 22, questionCount: 8,
      difficultyMix: ['EASY', 'MEDIUM', 'EASY', 'MEDIUM'], correctRate: 0.68, hintRate: 0.15,
      completed: true, planId: 'plan-arjun-2', topicId: 'quant-percentages',
    }));
  });

  // ============================================================
  // demo-priya: consistent, strong, well-calibrated - contrast case.
  // ============================================================
  events.push(ev({
    studentId: 'demo-priya', type: 'PLAN_ACCEPTED', occurredAtUtc: daysAgoIso(20), planId: 'plan-priya-1', plannedSessionMinutes: 30,
  }));
  for (let d = 19; d >= 0; d -= 2) {
    events.push(...buildSession({
      studentId: 'demo-priya', daysAgo: d, durationMinutes: 28, questionCount: 10,
      difficultyMix: ['MEDIUM', 'HARD', 'MEDIUM', 'HARD'], correctRate: 0.78, hintRate: 0.08,
      completed: true, planId: 'plan-priya-1', topicId: 'logical-reasoning',
    }));
    events.push(ev({
      studentId: 'demo-priya', type: 'CONFIDENCE_RECORDED', occurredAtUtc: daysAgoIso(d, 13, 5),
      confidencePercent: 68 + Math.round(Math.random() * 15),
    }));
  }

  // ============================================================
  // demo-neha: cold start - one session, two days ago.
  // ============================================================
  events.push(...buildSession({
    studentId: 'demo-neha', daysAgo: 2, durationMinutes: 18, questionCount: 6,
    difficultyMix: ['EASY'], correctRate: 0.6, hintRate: 0.2, completed: true, topicId: 'quant-percentages',
  }));

  // ============================================================
  // Content-friction demo: five different students all struggling with the
  // SAME question, to distinguish content friction from one student's
  // personal pattern (section 13).
  // ============================================================
  const frictionStudents = ['demo-a1', 'demo-a2', 'demo-a3', 'demo-a4', 'demo-a5'];
  for (const sid of frictionStudents) {
    for (let d = 3; d >= 0; d--) {
      const sessionId = `sess-${sid}-${d}`;
      events.push(ev({ studentId: sid, type: 'SESSION_STARTED', occurredAtUtc: daysAgoIso(d, 15, 0), sessionId }));
      events.push(ev({ studentId: sid, type: 'QUESTION_STARTED', occurredAtUtc: daysAgoIso(d, 15, 1), sessionId, questionId: 'q-hard-104', difficulty: 'HARD', topicId: 'quant-probability' }));
      events.push(ev({ studentId: sid, type: 'HINT_REQUESTED', occurredAtUtc: daysAgoIso(d, 15, 3), sessionId, questionId: 'q-hard-104', difficulty: 'HARD', topicId: 'quant-probability' }));
      events.push(ev({ studentId: sid, type: 'QUESTION_SKIPPED', occurredAtUtc: daysAgoIso(d, 15, 5), sessionId, questionId: 'q-hard-104', difficulty: 'HARD', topicId: 'quant-probability' }));
      events.push(ev({ studentId: sid, type: 'SESSION_COMPLETED', occurredAtUtc: daysAgoIso(d, 15, 15), sessionId, durationSeconds: 15 * 60, progressFraction: 1 }));
    }
  }

  for (const e of events) await eventStore.append(e);
  return events.length;
}
