import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getUserById } from "@/lib/db/repoUsers";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
});
