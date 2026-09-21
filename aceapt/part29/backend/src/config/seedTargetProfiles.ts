import { TARGET_PROFILES_SEED } from './targetProfiles.seed';
import { pool } from '../db/pool';

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const target of TARGET_PROFILES_SEED) {
      await client.query(
        `INSERT INTO target_profiles (target_id, name, description, active, typical_preparation_weeks)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (target_id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           active = EXCLUDED.active,
           typical_preparation_weeks = EXCLUDED.typical_preparation_weeks,
           updated_at = now()`,
        [target.targetId, target.name, target.description, target.active, target.typicalPreparationWeeks ?? null],
      );

      for (const req of target.requirements) {
        await client.query(
          `INSERT INTO target_capability_requirements (target_id, capability_id, importance, required_level)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (target_id, capability_id) DO UPDATE SET
             importance = EXCLUDED.importance,
             required_level = EXCLUDED.required_level`,
          [target.targetId, req.capabilityId, req.importance, req.requiredLevel],
        );
      }
    }
    await client.query('COMMIT');
    console.log(`[seed] upserted ${TARGET_PROFILES_SEED.length} target profiles`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exitCode = 1;
    });
}

export { seed };
