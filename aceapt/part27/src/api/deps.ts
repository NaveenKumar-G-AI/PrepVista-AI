/**
 * Composition root. This is intentionally the ONLY file that decides which
 * concrete implementations back each interface. To integrate with the real
 * PrepVista platform, this is the file to edit — swap InMemory* classes for
 * real ones; nothing in src/engines or src/services needs to change.
 */
import { InMemoryPlatformEvidenceGateway } from "../integration/inMemoryPlatformEvidenceGateway.js";
import { MockFeature26AdaptAdapter } from "../integration/feature26AdaptAdapter.js";
import { createAIExplanationProvider } from "../integration/aiExplanationProvider.js";
import { InMemoryForecastRepository } from "../repository/inMemoryForecastRepository.js";
import { TypedEventBus } from "../events/eventBus.js";
import { env } from "../config/env.js";
import type { ForecastPipelineDeps } from "../services/forecastOrchestrator.js";

export const gateway = new InMemoryPlatformEvidenceGateway();
export const repository = new InMemoryForecastRepository();
export const adaptAdapter = new MockFeature26AdaptAdapter();
export const eventBus = new TypedEventBus();
export const aiProvider = createAIExplanationProvider();

/** Placeholder for real institution/cohort membership (out of scope for
 * Feature 27 — this just lets the cohort endpoint be demoed). */
export const cohortMembership = new Map<string, string[]>();

export const deps: ForecastPipelineDeps = {
  gateway,
  repository,
  adaptAdapter,
  eventBus,
  aiProvider,
  defaultHorizonWeeks: env.defaultForecastHorizonWeeks,
};
