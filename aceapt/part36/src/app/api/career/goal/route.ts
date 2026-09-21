import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { bootstrapGoal } from "@/lib/services/actionCompiler";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  return NextResponse.json({ goal: goal ?? null });
});

export const POST = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const existing = getActiveGoal(userId);
  if (existing) {
    return NextResponse.json({ error: "GOAL_ALREADY_ACTIVE", goal: existing }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const targetRole = typeof body.targetRole === "string" ? body.targetRole.trim() : "";
  if (!title || !targetRole) {
    return NextResponse.json({ error: "TITLE_AND_ROLE_REQUIRED" }, { status: 400 });
  }

  const goal = await bootstrapGoal(userId, title, targetRole);
  return NextResponse.json({ goal });
});
