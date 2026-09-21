"use client";

import { useState } from "react";
import { useUser } from "@/lib/userContext";
import { apiPost, ApiError } from "@/lib/apiClient";

export default function LoginPage() {
  const { refresh } = useUser();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await apiPost("/api/auth/register", { email, password, name });
      } else {
        await apiPost("/api/auth/login", { email, password });
      }
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError((err.payload as { message?: string })?.message || "That didn't work — please check your details and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <p className="font-display text-2xl font-semibold text-ink">ACEAPT</p>
      <p className="mt-1 text-sm text-ink-muted">Career Execution Intelligence</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3 border border-hairline bg-surface p-6">
        <div className="flex gap-1 border-b border-hairline pb-3">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`px-2 py-1 text-sm ${mode === "login" ? "font-medium text-ink border-b-2 border-brass" : "text-ink-muted"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`px-2 py-1 text-sm ${mode === "register" ? "font-medium text-ink border-b-2 border-brass" : "text-ink-muted"}`}
          >
            Create account
          </button>
        </div>

        {mode === "register" && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink" />
          </div>
        )}
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : undefined}
            className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink"
          />
          {mode === "register" && <p className="mt-1 text-xs text-ink-faint">At least 8 characters.</p>}
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <button type="submit" disabled={busy} className="w-full bg-brass px-4 py-2.5 text-sm font-medium text-white hover:bg-brass-strong disabled:opacity-50">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        {mode === "login" && (
          <p className="pt-1 text-center text-xs text-ink-faint">
            Demo account: <span className="tnum">demo@aceapt.app</span> / <span className="tnum">demo1234</span>
          </p>
        )}
      </form>
    </div>
  );
}
