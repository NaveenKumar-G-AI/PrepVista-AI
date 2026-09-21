import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { hashPassword, setAuthCookie } from "@/lib/auth";
import { createUser, getUserByEmail } from "@/lib/db/repoUsers";

export const POST = withApi(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT", message: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  }
  if (getUserByEmail(email)) {
    return NextResponse.json({ error: "EMAIL_IN_USE" }, { status: 409 });
  }

  const user = createUser(email, hashPassword(password), name);
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name });
  setAuthCookie(response, user.id);
  return response;
});
