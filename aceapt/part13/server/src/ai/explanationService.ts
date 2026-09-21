import type { ReadinessSnapshot } from "../domain/types.js";
import type { SimulationPostmortem } from "../engines/postmortemEngine.js";
import { polishExplanation } from "./anthropicExplainer.js";
import { composePostmortemExplanation, composeReadinessExplanation, composeWhyNotReadyExplanation } from "./templateExplainer.js";

export interface Explanation {
  text: string;
  source: "template" | "ai_polished";
}

async function withOptionalPolish(templateText: string): Promise<Explanation> {
  const polished = await polishExplanation(templateText);
  return polished ? { text: polished, source: "ai_polished" } : { text: templateText, source: "template" };
}

export async function explainReadiness(snapshot: ReadinessSnapshot): Promise<Explanation> {
  return withOptionalPolish(composeReadinessExplanation(snapshot));
}

export async function explainWhyNotReady(snapshot: ReadinessSnapshot): Promise<Explanation> {
  return withOptionalPolish(composeWhyNotReadyExplanation(snapshot));
}

export async function explainPostmortem(pm: SimulationPostmortem): Promise<Explanation> {
  return withOptionalPolish(composePostmortemExplanation(pm));
}
