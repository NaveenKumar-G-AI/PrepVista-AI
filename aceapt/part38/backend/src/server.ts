import express from "express";
import { positioningRouter } from "./routes/positioning";
import { errorHandler } from "./errors";
import { seedDemoData } from "./data/demoSeed";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/students", positioningRouter);

app.use(errorHandler);

async function main() {
  if (process.env.SEED_DEMO_DATA === "true") {
    await seedDemoData();
    console.log('Seeded demo data (SEED_DEMO_DATA=true): studentId="demo-student", roleId="role-backend".');
  }

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`Feature 38 positioning service listening on port ${port}`);
  });
}

main();
