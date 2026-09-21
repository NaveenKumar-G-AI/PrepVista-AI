import fs from 'node:fs';
import path from 'node:path';
import { getDb, toJson } from './db';
import { Question } from '../domain/types';
import { nowIso } from '../utils/ids';
import { log } from '../utils/logger';

export const DEMO_STUDENT_ID = 'demo-student-1';

export function seed(): void {
  const db = getDb();

  const questionsPath = path.join(__dirname, 'seed-data', 'questions.json');
  const raw = fs.readFileSync(questionsPath, 'utf-8');
  const questions: Question[] = JSON.parse(raw);

  const insertQuestion = db.prepare(`
    INSERT INTO questions
      (id, domain, topic, skill, difficulty, prompt, context, options_json, correct_option_id, explanation, expected_time_seconds, health, tags_json, created_at)
    VALUES (@id, @domain, @topic, @skill, @difficulty, @prompt, @context, @options_json, @correct_option_id, @explanation, @expected_time_seconds, @health, @tags_json, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      domain=excluded.domain, topic=excluded.topic, skill=excluded.skill, difficulty=excluded.difficulty,
      prompt=excluded.prompt, context=excluded.context, options_json=excluded.options_json,
      correct_option_id=excluded.correct_option_id, explanation=excluded.explanation,
      expected_time_seconds=excluded.expected_time_seconds, health=excluded.health, tags_json=excluded.tags_json
  `);

  const insertAll = db.transaction((qs: Question[]) => {
    for (const q of qs) {
      insertQuestion.run({
        id: q.id,
        domain: q.domain,
        topic: q.topic,
        skill: q.skill,
        difficulty: q.difficulty,
        prompt: q.prompt,
        context: q.context ?? null,
        options_json: toJson(q.options),
        correct_option_id: q.correctOptionId,
        explanation: q.explanation,
        expected_time_seconds: q.expectedTimeSeconds,
        health: q.health,
        tags_json: toJson(q.tags),
        created_at: q.createdAt,
      });
    }
  });

  insertAll(questions);
  log(`Seeded ${questions.length} questions.`);

  db.prepare(`INSERT OR IGNORE INTO students (id, name, created_at) VALUES (?, ?, ?)`).run(
    DEMO_STUDENT_ID,
    'Demo Student',
    nowIso()
  );
  log(`Ensured demo student '${DEMO_STUDENT_ID}' exists.`);
}

// Allow running directly: `npm run seed`
if (require.main === module) {
  seed();
  log('Seed complete.');
}
