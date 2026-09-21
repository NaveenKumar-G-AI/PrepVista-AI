import * as fs from "node:fs";
import * as path from "node:path";
import { createApp } from "./api/app";
import { InMemoryHintInteractionRepository, InMemoryHintOutcomeRepository, InMemoryHintPreferenceRepository } from "./persistence/repositories";
import { createDefaultHintGenerator } from "./generation/hintGenerator";
import { ConsoleAnalyticsSink } from "./analytics/analytics";
import { AssessmentConfigService, MasteryService, MistakeIntelligenceService, StudentSessionService } from "./integration/stubs";

/** Dependency-free .env loader so this runs the same regardless of Node version. */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, "..", ".env"));

const app = createApp({
  interactionRepo: new InMemoryHintInteractionRepository(),
  outcomeRepo: new InMemoryHintOutcomeRepository(),
  preferenceRepo: new InMemoryHintPreferenceRepository(),
  generator: createDefaultHintGenerator(),
  mistakeIntelligence: new MistakeIntelligenceService(),
  assessmentConfig: new AssessmentConfigService(),
  sessionService: new StudentSessionService(),
  masteryService: new MasteryService(),
  analytics: new ConsoleAnalyticsSink(),
});

const port = Number(process.env.PORT) || 4048;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 48 (Hint Intelligence Engine) listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    // eslint-disable-next-line no-console
    console.log("ANTHROPIC_API_KEY is empty — running fully on deterministic hint templates (this is expected and fine).");
  }
});
