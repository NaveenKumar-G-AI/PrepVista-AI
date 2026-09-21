import { NextRequest, NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";

type RouteFn<T> = (request: NextRequest, ctx: T) => Promise<NextResponse>;

/** Wraps a route handler so that auth failures return a clean 401 and
 *  unexpected errors return a 500 with a message the UI can show
 *  without breaking the surrounding page (spec section 66). Route
 *  handlers should let unexpected errors throw rather than catching
 *  them individually — this is the single place that decides what
 *  the client sees. */
export function withApi<T = unknown>(fn: RouteFn<T>): RouteFn<T> {
  return async (request, ctx) => {
    try {
      return await fn(request, ctx);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      console.error("[aceapt] API error:", err);
      return NextResponse.json(
        {
          error: "TEMPORARILY_UNAVAILABLE",
          message: "Something on our side didn't respond. Your data is safe — please try again.",
        },
        { status: 500 }
      );
    }
  };
}
