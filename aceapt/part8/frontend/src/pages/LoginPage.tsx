import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-faint">ACEAPT</p>
          <h1 className="font-display text-2xl mt-1 display-crossbar inline-block">Mastery Verification</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-lg shadow-card p-6 space-y-4">
          <div className="flex rounded-md border border-line overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 py-2 ${mode === "login" ? "bg-ink text-paper" : "bg-paper-raised text-ink-soft"}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 py-2 ${mode === "register" ? "bg-ink text-paper" : "bg-paper-raised text-ink-soft"}`}
            >
              Create account
            </button>
          </div>

          {mode === "register" && (
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-ink-faint">Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verified/40 focus:border-verified"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verified/40 focus:border-verified"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verified/40 focus:border-verified"
            />
          </label>

          {error && <p className="text-sm text-regressed">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-ink text-paper py-2.5 text-sm font-medium hover:bg-ink/90 disabled:opacity-60"
          >
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
