import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { createCommitment, listUpcomingCommitments } from "@/lib/db/repoPlanning";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  return NextResponse.json({ commitments: listUpcomingCommitments(userId) });
});

export const POST = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const eventDate = typeof body.eventDate === "string" ? body.eventDate : "";
  if (!title || !eventDate) return NextResponse.json({ error: "TITLE_AND_DATE_REQUIRED" }, { status: 400 });

  const commitment = createCommitment({
    userId,
    title,
    commitmentType: body.commitmentType === "PERSONAL" ? "PERSONAL" : "ACADEMIC",
    eventDate,
    loadLevel: ["LOW", "MEDIUM", "HIGH"].includes(body.loadLevel) ? body.loadLevel : "HIGH",
  });
  return NextResponse.json({ commitment });
});
