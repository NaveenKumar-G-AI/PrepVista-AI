/**
 * Dev-only seed data. Creates two demo students and mock capability
 * snapshots so the goal engine has real rows to compute against.
 * Connects via MIGRATION_DATABASE_URL (owner role) because inserting
 * into `students` stands in for a system Feature 44 does not own.
 *
 * Student A's numbers intentionally match the worked example in the
 * Feature 44 spec (Section 71): Quant 72, Logical 54, Verbal 68.
 */
import pg from "pg";

async function main() {
  const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await client.connect();

  await client.query("BEGIN");
  await client.query("DELETE FROM goal_history_events");
  await client.query("DELETE FROM goal_snapshots");
  await client.query("DELETE FROM goal_milestones");
  await client.query("DELETE FROM goals");
  await client.query("DELETE FROM mock_capability_snapshots");
  await client.query("DELETE FROM students");

  const studentA = await client.query(
    `INSERT INTO students (id, display_name) VALUES (gen_random_uuid(), 'Demo Student A') RETURNING id`
  );
  const studentB = await client.query(
    `INSERT INTO students (id, display_name) VALUES (gen_random_uuid(), 'Demo Student B') RETURNING id`
  );
  const idA = studentA.rows[0].id;
  const idB = studentB.rows[0].id;

  await client.query(
    `INSERT INTO mock_capability_snapshots
      (student_id, quant, logical, verbal, probability, data_interpretation,
       accuracy, speed_band, consistency, improvement_rate_per_hour)
     VALUES ($1, 72, 54, 68, 49, 61, 71, 'DEVELOPING', 58,
       $2::jsonb)`,
    [
      idA,
      JSON.stringify({
        quant: 1.1,
        logical: 2.4,
        verbal: 0.9,
        probability: 2.1,
        data_interpretation: 1.4,
      }),
    ]
  );

  await client.query(
    `INSERT INTO mock_capability_snapshots
      (student_id, quant, logical, verbal, probability, data_interpretation,
       accuracy, speed_band, consistency, improvement_rate_per_hour)
     VALUES ($1, 81, 77, 78, 72, 73, 84, 'ON_PACE', 75, $2::jsonb)`,
    [idB, JSON.stringify({ quant: 0.6, logical: 0.5, verbal: 0.4 })]
  );

  await client.query("COMMIT");
  console.log("Seeded:");
  console.log("  Student A:", idA, "(Quant 72 / Logical 54 / Verbal 68 - matches spec example)");
  console.log("  Student B:", idB, "(already strong across the board)");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
