import { calculateVelocity, detectPlateau, detectRegression, type TimePoint } from "../engine/index.js";

export type TrendLabel = "IMPROVING" | "STABLE" | "PLATEAU" | "DECLINING" | "INSUFFICIENT_EVIDENCE";

const VELOCITY_NOISE_FLOOR_PER_WEEK = 0.5;

/**
 * Combines the engine's independent signals into the single trend label the
 * dashboard shows. Precedence: a confirmed regression always wins (it's the
 * most actionable signal), then plateau, then velocity direction.
 */
export function calculatePlateauAwareTrend(points: TimePoint[]): {
  label: TrendLabel;
  velocityPerWeek?: number;
} {
  const regression = detectRegression(points);
  if (regression.status === "REGRESSION_DETECTED") return { label: "DECLINING" };

  const plateau = detectPlateau(points);
  if (plateau.status === "PLATEAU") return { label: "PLATEAU" };

  const velocity = calculateVelocity(points);
  if (velocity.status === "INSUFFICIENT_EVIDENCE") return { label: "INSUFFICIENT_EVIDENCE" };

  if (velocity.perWeek! > VELOCITY_NOISE_FLOOR_PER_WEEK) return { label: "IMPROVING", velocityPerWeek: velocity.perWeek };
  if (velocity.perWeek! < -VELOCITY_NOISE_FLOOR_PER_WEEK) return { label: "DECLINING", velocityPerWeek: velocity.perWeek };
  return { label: "STABLE", velocityPerWeek: velocity.perWeek };
}
