import type { CorsOptions } from "cors";
import { env, isProduction } from "../config/env";
import { baseLogger } from "./logger";

/**
 * CORS SECURITY
 * -----------------------------------------------------------------------
 * "Production must not use unrestricted origins unless there is a
 * legitimate, explicitly justified architecture requiring them." There is
 * no such requirement here, so there is no wildcard fallback: origins
 * come only from CORS_ALLOWED_ORIGINS (exact match, comma-separated). If
 * it's unset in production, every browser-origin request is rejected —
 * loudly logged once at boot so it's an obvious deploy-config gap, not a
 * silent security hole.
 */

const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  baseLogger.warn(
    "CORS_ALLOWED_ORIGINS is empty in production — every browser-origin request will be rejected. " +
      "Set it to your real frontend origin(s) before relying on this from a browser client."
  );
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Non-browser callers (curl, server-to-server, same-origin) send no
    // Origin header at all — allow those through; CORS is a browser
    // enforcement mechanism, not a substitute for authentication.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin "${origin}" is not allowed by CORS policy.`));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id"]
};
