import { getPool, closeAllPools } from "../lib/db/pool";
import { FIXTURE_USERS } from "../lib/db/fixtures";

async function main() {
  const pool = getPool("admin");
  for (const u of Object.values(FIXTURE_USERS)) {
    await pool.query(
      `insert into auth.users (id, email) values ($1, $2)
       on conflict (id) do nothing`,
      [u.id, u.email]
    );
    await pool.query(
      `insert into public.profiles (id, role, display_name) values ($1, $2, $3)
       on conflict (id) do update set role = excluded.role`,
      [u.id, u.role, u.email.split("@")[0]]
    );
  }
  console.log("seeded fixture users:", Object.values(FIXTURE_USERS).map((u) => `${u.role}:${u.id}`).join(", "));
  await closeAllPools();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
