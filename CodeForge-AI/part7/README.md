# CodeForge AI - Part 7: Learning Session Orchestration

Part 7 is integrated into the unified platform as the learning-session layer between roadmap planning and active practice.

## Production Surface

- Domain types: `unified/src/domain/types.ts`
- Engine: `unified/src/engine/learning-session/`
- API routes: `unified/src/api/routes/learningSessions.ts`
- Database migration: `unified/db/migrations/0004_learning_sessions.sql`
- Tests: `unified/tests/learningSession.engine.test.ts`

## API Base

`/api/v1/learning-sessions`

This module plans sessions from roadmap activities, recommendations, skill states, and recent evidence. It tracks session state, activity lifecycle, evidence attachment, summaries, and next-action decisions.

