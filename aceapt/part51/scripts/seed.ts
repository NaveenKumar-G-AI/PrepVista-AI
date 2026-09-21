import { seedDemoStudent } from "./lib/seedData.js";
import { closeAllPools } from "../src/db/pool.js";

seedDemoStudent()
  .then(async (result) => {
    console.log(JSON.stringify(result, null, 2));
    await closeAllPools();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await closeAllPools();
    process.exit(1);
  });
