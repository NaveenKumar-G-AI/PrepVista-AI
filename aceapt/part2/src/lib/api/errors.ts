import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/demoAuth";

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Consistent error shape across every route — no stack traces or internals leaked to the client. */
export function apiError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
