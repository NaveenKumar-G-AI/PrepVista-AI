import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { verifyPassword, setAuthCookie } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/repoUsers";

export const POST = withApi(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." }, { status: 401 });
  }

  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name });
  setAuthCookie(response, user.id);
  return response;
});
