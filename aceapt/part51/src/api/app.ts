import express, { type Request, type Response, type NextFunction } from "express";
import { router as accuracyRouter } from "./routes/accuracy.routes.js";
import { InvalidStateTransitionError } from "../state/sessionStateMachine.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/accuracy", accuracyRouter);

  // §106 fairness / §104 answer-key protection both start with never leaking
  // internals in an error response — this handler returns a clean message
  // and status, never a stack trace or raw DB error, to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof InvalidStateTransitionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (typeof err === "object" && err !== null && "status" in err && typeof (err as { status: unknown }).status === "number") {
      const e = err as { status: number; message: string };
      res.status(e.status).json({ error: e.message });
      return;
    }
    if (err && typeof err === "object" && "issues" in err) {
      // zod validation error
      res.status(400).json({ error: "Invalid request", details: (err as { issues: unknown }).issues });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
