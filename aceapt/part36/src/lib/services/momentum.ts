import { listActionsByStatus } from "../db/repoActions";
import { listOutcomesSince } from "../db/repoExecution";
import { daysAgoIso } from "./dates";
import type { MomentumLabel } from "../types";

export interface MomentumResult {
  label: MomentumLabel;
  facts: string[];
}

const COMPLETED_STATUSES = ["SELF_REPORTED_COMPLETE", "VERIFIED_COMPLETE", "MEASURED", "IMPROVED"] as const;

export function computeMomentum(userId: string): MomentumResult {
  const allCompleted = listActionsByStatus(userId, [...COMPLETED_STATUSES]);
  if (allCompleted.length < 2) {
    return { label: "INSUFFICIENT_DATA", facts: ["Complete a few more actions to see a momentum signal here"] };
  }

  const since = daysAgoIso(14);
  const recentCompleted = allCompleted.filter((a) => a.completedAt && a.completedAt >= since);
  const activeDays = new Set(recentCompleted.map((a) => (a.completedAt as string).slice(0, 10))).size;
  const improvements = listOutcomesSince(userId, since).filter((o) => o.impact === "POSITIVE_SIGNAL").length;

  const facts: string[] = [
    `${recentCompleted.length} action${recentCompleted.length === 1 ? "" : "s"} completed in the last 14 days`,
  ];
  if (improvements > 0) facts.push(`${improvements} measured improvement${improvements === 1 ? "" : "s"} in that window`);

  let label: MomentumLabel;
  if (activeDays >= 8 && improvements >= 1) {
    label = "STRONG";
  } else if (activeDays >= 4) {
    label = "STEADY";
  } else if (recentCompleted.length >= 1) {
    label = "BUILDING";
  } else {
    label = "RESTARTING";
    facts.push("No completed actions in the last 14 days — picking back up doesn't erase what came before");
  }

  return { label, facts };
}
