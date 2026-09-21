import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getTodayView } from "@/lib/services/todayService";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const view = await getTodayView(userId);
  return NextResponse.json(view);
});
