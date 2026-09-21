import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActionById } from "@/lib/db/repoActions";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { reportBlocker } from "@/lib/services/blockerService";
import { refreshRecommendations } from "@/lib/services/recommendation";
import type { BlockerReasonCode } from "@/lib/types";

const VALID_REASONS: BlockerReasonCode[] = [
  "DONT_UNDERSTAND",
  "TOO_DIFFICULT",
  "NO_TIME",
  "DONT_KNOW_START",
  "MISSING_PREREQUISITE",
  "PRIORITY_CHANGED",
  "OTHER",
];

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const userId = requireUserId(request);
  const { id } = await params;

  const action = getActionById(userId, id);
  if (!action) return NextResponse.json({ error: "ACTION_NOT_FOUND" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const reasonCode: BlockerReasonCode = VALID_REASONS.includes(body.reasonCode) ? body.reasonCode : "OTHER";
  const reasonNote = typeof body.reasonNote === "string" ? body.reasonNote.trim().slice(0, 500) : null;

  const result = await reportBlocker(userId, action.id, reasonCode, reasonNote);

  const goal = getActiveGoal(userId);
  const next = goal ? await refreshRecommendations(userId, goal) : { primary: null, supporting: [] };

  return NextResponse.json({
    action: result.action,
    unblockAction: result.unblockAction,
    nextPrimary: next.primary?.action ?? null,
  });
});
