"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "signedOut" | "signedIn">("checking");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getClaims().then(({ data }) => {
      setStatus(data?.claims?.sub ? "signedIn" : "signedOut");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "signedIn" : "signedOut");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (status === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-console-textMuted text-sm">Loading…</div>;
  }

  if (status === "signedOut") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-console-border bg-console-surface p-6 shadow-panel">
          <h1 className="font-data text-sm tracking-wide text-console-textMuted">CODEFORGE · INCIDENT RESPONSE</h1>
          <p className="mt-2 text-lg font-semibold">Sign in to continue</p>
          {sent ? (
            <p className="mt-4 text-sm text-sev-healthy">
              Check <span className="font-data">{email}</span> for a sign-in link.
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
                if (error) setError(error.message);
                else setSent(true);
              }}
            >
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-console-border bg-console-raised px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-glow transition-colors"
              >
                Send magic link
              </button>
              {error && <p className="text-sm text-sev-critical">{error}</p>}
            </form>
          )}
          <p className="mt-4 text-xs text-console-textFaint">
            Uses Supabase Auth directly — set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
