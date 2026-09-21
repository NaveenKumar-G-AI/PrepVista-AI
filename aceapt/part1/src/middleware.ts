import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  STUDENT_ID_HEADER,
  signStudentId,
  verifySignedStudentId,
  newStudentId,
} from "@/lib/session";

export async function middleware(request: NextRequest) {
  const existingCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let studentId = existingCookie ? await verifySignedStudentId(existingCookie) : null;
  let needsNewCookie = false;

  if (!studentId) {
    // Either a first visit, or a cookie that failed signature verification (tampered/forged).
    // Either way, the correct move is a *fresh* identity — never trust the unsigned value.
    studentId = newStudentId();
    needsNewCookie = true;
  }

  // Forward the resolved id via a request header so it's readable in the *same* request by
  // Server Components (`headers()`) and Route Handlers (`request.headers`) — the Set-Cookie
  // below only takes effect on the *next* request from the browser.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(STUDENT_ID_HEADER, studentId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });

  if (needsNewCookie) {
    response.cookies.set(SESSION_COOKIE_NAME, await signStudentId(studentId), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180, // 180 days
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
