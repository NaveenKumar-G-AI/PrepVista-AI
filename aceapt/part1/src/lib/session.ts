/**
 * Demo-grade, dependency-free session identity.
 *
 * There is no email/password login here — see README "Known limitations" for why, and for how
 * to swap in real auth. What this module DOES guarantee, honestly: every request is bound to a
 * signed, httpOnly, server-issued identifier, and the signature is verified before any
 * studentId is trusted. A client cannot simply send `Cookie: aceapt_sid=<someone-else's-id>`
 * and read that student's data — without knowing SESSION_SECRET they cannot produce a
 * signature that passes `verifySignedStudentId`, so a forged cookie just results in a fresh,
 * empty identity rather than someone else's context. That's the specific claim in spec section
 * 37 ("do not trust a client-supplied student_id without authorization verification") that this
 * code satisfies — no more, no less.
 *
 * Built on Web Crypto (`crypto.subtle`, `crypto.randomUUID`) rather than Node's `crypto` module
 * so the same code runs unmodified in both the Edge middleware and Node route handlers.
 */

export const SESSION_COOKIE_NAME = "aceapt_sid";
export const STUDENT_ID_HEADER = "x-student-id";

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail loudly in a way that's still recoverable for local dev — .env ships a default,
    // so reaching here means it was deliberately removed.
    console.warn(
      "[session] SESSION_SECRET is not set — falling back to an insecure default. Set it in .env before deploying.",
    );
    return "dev-only-secret-change-before-deploying";
  }
  return secret;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signStudentId(studentId: string): Promise<string> {
  const key = await hmacKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(studentId));
  return `${studentId}.${toHex(sig)}`;
}

export async function verifySignedStudentId(signedValue: string): Promise<string | null> {
  const dot = signedValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const studentId = signedValue.slice(0, dot);
  const providedSig = signedValue.slice(dot + 1);
  const key = await hmacKey(getSecret());
  const expected = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(studentId)));
  return timingSafeEqual(expected, providedSig) ? studentId : null;
}

export function newStudentId(): string {
  return crypto.randomUUID();
}

/** For use inside Route Handlers, which receive the request directly. Middleware guarantees
 *  this header is present on every request that reaches app code — see src/middleware.ts. */
export function getStudentIdFromHeaders(headers: Headers): string | null {
  return headers.get(STUDENT_ID_HEADER);
}
