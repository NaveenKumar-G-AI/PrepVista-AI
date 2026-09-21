import { createApp } from "./api/app.js";
import { env, isAiConfigured } from "./config/env.js";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `ACEAPT Feature 51 — Accuracy Training Engine listening on :${env.port} ` +
      `(AI explanations: ${isAiConfigured() ? "Anthropic-adapter" : "deterministic fallback, no key configured"})`
  );
});
