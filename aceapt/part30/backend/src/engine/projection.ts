import type { ReadinessProjection } from "../domain/types.js";
import type { RawForecast } from "../integrations/forecastClient.js";

/**
 * Section 37: "Never display 'Guaranteed ready on August 25.' Prefer
 * 'Projected readiness window: approximately 6-8 weeks.' If confidence is
 * low: 'Projection confidence: Low.'" This is the one place that copy is
 * assembled, so no other layer can accidentally phrase a range as a promise.
 */
export function formatProjection(raw: RawForecast): ReadinessProjection {
  if (raw.weeksLow == null || raw.weeksHigh == null) {
    return {
      windowLabel: "Not enough evidence yet to project a readiness window.",
      weeksLow: null,
      weeksHigh: null,
      confidence: raw.confidence,
      basis: raw.basis,
    };
  }
  if (raw.weeksLow === 0 && raw.weeksHigh === 0) {
    return {
      windowLabel: "Target readiness already met.",
      weeksLow: 0,
      weeksHigh: 0,
      confidence: raw.confidence,
      basis: raw.basis,
    };
  }

  const low = Math.round(raw.weeksLow);
  const high = Math.max(low, Math.round(raw.weeksHigh));
  const windowLabel = low === high ? `approximately ${low} week${low === 1 ? "" : "s"}` : `approximately ${low}-${high} weeks`;

  return {
    windowLabel,
    weeksLow: low,
    weeksHigh: high,
    confidence: raw.confidence,
    basis: raw.basis,
  };
}
