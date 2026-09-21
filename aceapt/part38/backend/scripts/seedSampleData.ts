// Standalone CLI seed. Note: this only seeds the process that runs it — it
// will NOT populate a dev server running in a separate process. To seed a
// running dev server, start it with SEED_DEMO_DATA=true instead (see below).

import { seedDemoData } from "../src/data/demoSeed";

seedDemoData().then(() => {
  console.log('Seeded demo data for studentId="demo-student", roleId="role-backend".');
  console.log("This only affects the process that just ran — it will not appear in a");
  console.log("separately-running dev server. To preview the API with demo data, run:");
  console.log("  SEED_DEMO_DATA=true npm run dev");
});
