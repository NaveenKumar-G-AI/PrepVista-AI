import { createApp } from "./app.js";

const app = createApp();

// Belt-and-suspenders: a bug outside the request/response cycle (e.g. the
// event bus's background drain loop, which already has its own try/catch --
// see events/eventBus.ts) must never take the whole process down. Modern
// Node terminates on an unhandled rejection by default; this reference
// build would rather log loudly and keep serving students than do that.
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection -- this indicates a bug; a code path is missing its own error handling", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException -- this indicates a bug; a code path is missing its own error handling", err);
});

const port = Number(process.env.PORT || 4030);
app.listen(port, () => {
  console.log(`ACEAPT PATH engine listening on :${port}`);
});
