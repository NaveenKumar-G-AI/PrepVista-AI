import express from "express";
import cors from "cors";
import "dotenv/config";
import { authRouter } from "./routes/auth.routes.js";
import { skillsRouter } from "./routes/skills.routes.js";
import { masteryRouter } from "./routes/mastery.routes.js";
import { verificationRouter } from "./routes/verification.routes.js";
import { reviewRouter } from "./routes/review.routes.js";
import { historyRouter } from "./routes/history.routes.js";
import { ingestRouter } from "./routes/ingest.routes.js";
import { signalsRouter } from "./routes/signals.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aceapt-feature8-mastery-engine", time: new Date().toISOString() });
});

app.use("/auth", authRouter);
app.use("/skills", skillsRouter);
// Route order matters here: masteryRouter contains GET /:skillId, a
// single-segment catch-all. If mounted before the equally single-segment
// /mastery/reviews, Express matches "reviews" as a :skillId and 404s
// before reviewRouter ever gets a turn - caught live by the demo
// walkthrough script. Routes with 2+ segments after /mastery (verify/*,
// history/:skillId, ingest/evidence) are safe regardless of order, but
// /mastery/reviews is exactly one segment, so it has to come first.
app.use("/mastery/reviews", reviewRouter);
app.use("/mastery/history", historyRouter);
app.use("/mastery/ingest", ingestRouter);
app.use("/mastery", verificationRouter);
app.use("/mastery", masteryRouter);
app.use("/signals", signalsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT) || 4008;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[aceapt-feature8] listening on :${port}`);
});
