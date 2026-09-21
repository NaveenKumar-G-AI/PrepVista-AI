import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { createOpportunity, listUpcomingOpportunities } from "@/lib/db/repoPlanning";
import { logEvent } from "@/lib/db/repoPlanning";
import type { OpportunityType } from "@/lib/types";

const VALID_TYPES: OpportunityType[] = ["INTERVIEW", "APPLICATION_DEADLINE", "ASSESSMENT", "PLACEMENT_DRIVE"];

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  return NextResponse.json({ opportunities: listUpcomingOpportunities(userId) });
});

export const POST = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });

  const opportunityType: OpportunityType = VALID_TYPES.includes(body.opportunityType) ? body.opportunityType : "INTERVIEW";
  const opportunity = createOpportunity({
    userId,
    title,
    organization: typeof body.organization === "string" ? body.organization.trim() : null,
    eventDate: typeof body.eventDate === "string" ? body.eventDate : null,
    opportunityType,
    requiredCapabilities: Array.isArray(body.requiredCapabilities) ? body.requiredCapabilities : [],
  });
  logEvent(userId, "DEADLINE_CHANGED", { opportunityId: opportunity.id, eventDate: opportunity.eventDate });

  return NextResponse.json({ opportunity });
});
