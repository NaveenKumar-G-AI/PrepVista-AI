import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../api/AuthContext.js";
import { Button } from "../components/ui.js";
import { TextField } from "../components/Field.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/companies");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">PrepVista</p>
          <h1 className="font-display text-2xl font-medium text-ink">Companies &amp; Recruiters</h1>
        </div>
        <form onSubmit={onSubmit} className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="space-y-4">
            <TextField
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tpo@yourcollege.edu"
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-md bg-signal-risk/10 px-3 py-2 text-sm text-signal-risk">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="mt-5 w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Run <code className="rounded bg-line/60 px-1 py-0.5">npm run seed:dev</code> in the server if you don't have a login yet.
        </p>
      </div>
    </div>
  );
}
