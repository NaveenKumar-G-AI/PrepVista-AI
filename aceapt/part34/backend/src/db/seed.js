import { replaceAll, newId } from './store.js';

export const DEMO_STUDENT_ID = 'demo-student';

/*
 * ---------------------------------------------------------------------------
 * DEMO / SEED DATA
 * ---------------------------------------------------------------------------
 * Everything in this file is FICTIONAL, for local development and demoing
 * Feature 34 end-to-end. It is not real student data and must never be
 * treated as such. When ACEAPT's real evidence sources are wired in
 * (assessments, practice, simulations, projects - see ARCHITECTURE.md),
 * this seed should be removed rather than merged with real records.
 *
 * The story this data tells is intentional: DSA and Database Fundamentals
 * genuinely improve, API Development is already strong, System Design has
 * no evidence at all yet, and Technical Interview Communication gets
 * *more* practice attempts over time while its score stays flat. That last
 * one is the "activity is not the same as progress" pattern from the brief
 * (section 7) - the engine detects it from the numbers below, it is not a
 * hardcoded message.
 * ---------------------------------------------------------------------------
 */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export function buildSeedState() {
  const studentId = DEMO_STUDENT_ID;

  const rawSignals = [
    // DSA - improving trend
    { capability: 'dsa', type: 'assessment', score: 48, occurredAt: daysAgo(44) },
    { capability: 'dsa', type: 'practice', score: 53, occurredAt: daysAgo(36) },
    { capability: 'dsa', type: 'practice', score: 58, occurredAt: daysAgo(27) },
    { capability: 'dsa', type: 'assessment', score: 65, occurredAt: daysAgo(18) },
    { capability: 'dsa', type: 'practice', score: 69, occurredAt: daysAgo(9) },
    { capability: 'dsa', type: 'assessment', score: 73, occurredAt: daysAgo(2) },

    // API Development - already strong and stable, not a limiting factor
    { capability: 'api_development', type: 'project', score: 82, occurredAt: daysAgo(40) },
    { capability: 'api_development', type: 'practice', score: 84, occurredAt: daysAgo(24) },
    { capability: 'api_development', type: 'simulation', score: 83, occurredAt: daysAgo(6) },

    // Database Fundamentals - moderate, slowly improving
    { capability: 'database_fundamentals', type: 'assessment', score: 58, occurredAt: daysAgo(38) },
    { capability: 'database_fundamentals', type: 'practice', score: 62, occurredAt: daysAgo(21) },
    { capability: 'database_fundamentals', type: 'practice', score: 66, occurredAt: daysAgo(5) },

    // Technical Interview Communication - activity keeps increasing,
    // score stays essentially flat
    { capability: 'technical_interview_communication', type: 'simulation', score: 54, occurredAt: daysAgo(35) },
    { capability: 'technical_interview_communication', type: 'practice', score: 57, occurredAt: daysAgo(28) },
    { capability: 'technical_interview_communication', type: 'practice', score: 53, occurredAt: daysAgo(20) },
    { capability: 'technical_interview_communication', type: 'simulation', score: 56, occurredAt: daysAgo(13) },
    { capability: 'technical_interview_communication', type: 'practice', score: 55, occurredAt: daysAgo(7) },
    { capability: 'technical_interview_communication', type: 'simulation', score: 57, occurredAt: daysAgo(1) },

    // System Design - intentionally no evidence yet (evidence gap, not a capability gap)
  ];

  const rawDecisions = [
    {
      studentId,
      type: 'target_selected',
      payload: { targetId: 'backend_developer', note: 'Initial target on signup' },
      occurredAt: daysAgo(44),
    },
  ];

  return {
    students: {
      [studentId]: {
        id: studentId,
        name: 'Demo Student',
        activeTargetId: 'backend_developer',
        createdAt: daysAgo(44),
      },
    },
    signals: rawSignals.map((s) => ({ id: newId(), studentId, note: '', ...s })),
    decisions: rawDecisions.map((d) => ({ id: newId(), ...d })),
  };
}

export function seed() {
  replaceAll(buildSeedState());
  console.log('[seed] demo data loaded for studentId =', DEMO_STUDENT_ID);
}

// Allows `npm run reset-demo` to reseed from the CLI.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed();
}
