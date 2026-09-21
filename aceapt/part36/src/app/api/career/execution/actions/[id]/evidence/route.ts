import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActionById, markCompleted } from "@/lib/db/repoActions";
import { getActiveGoal, getCurrentBottleneck, setBottleneck } from "@/lib/db/repoGoals";
import { recordEvidence } from "@/lib/services/evidenceService";
import { refreshRecommendations } from "@/lib/services/recommendation";
import { logEvent } from "@/lib/db/repoPlanning";
import type { EvidenceQuality } from "@/lib/types";

const VALID_QUALITIES: EvidenceQuality[] = ["SELF_REPORTED", "OBSERVED", "VERIFIED", "MEASURED"];

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const userId = requireUserId(request);
  const { id } = await params;

  const action = getActionById(userId, id);
  if (!action) return NextResponse.json({ error: "ACTION_NOT_FOUND" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const evidenceQuality: EvidenceQuality = VALID_QUALITIES.includes(body.evidenceQuality) ? body.evidenceQuality : "SELF_REPORTED";
  const scoreValue = typeof body.scoreValue === "number" && Number.isFinite(body.scoreValue) ? body.scoreValue : null;

  const { evidence, outcome } = recordEvidence({
    userId,
    actionId: action.id,
    evidenceQuality,
    resultSummary: typeof body.resultSummary === "string" ? body.resultSummary.trim().slice(0, 500) : null,
    scoreValue,
    scoreLabel: typeof body.scoreLabel === "string" ? body.scoreLabel.trim().slice(0, 100) : null,
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null,
  });
  logEvent(userId, "EVIDENCE_RECORDED", { actionId: action.id, evidenceQuality });
  logEvent(userId, "RESULT_MEASURED", { actionId: action.id, impact: outcome.impact });

  // Status reflects evidence quality, never downgraded below where it
  // already is (spec section 22 — states are cumulative signal, not
  // a simple checkbox).
  if (evidenceQuality === "MEASURED" && outcome.impact === "POSITIVE_SIGNAL") {
    markCompleted(userId, action.id, "IMPROVED");
  } else if (evidenceQuality === "MEASURED") {
    markCompleted(userId, action.id, "MEASURED");
  } else if (evidenceQuality === "VERIFIED") {
    markCompleted(userId, action.id, "VERIFIED_COMPLETE");
  }

  const goal = getActiveGoal(userId);
  if (goal && action.capabilityAreaId && !getCurrentBottleneck(userId, goal.id)) {
    // First real measured/verified signal on a brand-new goal — this
    // is the moment "Unknown" resolves into an actual bottleneck,
    // rather than one being assumed at goal creation (spec Rule 9).
    if (evidenceQuality === "MEASURED" || evidenceQuality === "VERIFIED") {
      setBottleneck(userId, goal.id, action.capabilityAreaId);
      logEvent(userId, "PLAN_ADJUSTED", { goalId: goal.id, reason: "BOTTLENECK_ESTABLISHED", capabilityAreaId: action.capabilityAreaId });
    }
  }

  const next = goal ? await refreshRecommendations(userId, goal) : { primary: null, supporting: [] };

  return NextResponse.json({
    evidence,
    outcome,
    action: getActionById(userId, action.id),
    nextPrimary: next.primary?.action ?? null,
  });
});
