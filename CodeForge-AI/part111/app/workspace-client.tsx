"use client";

import { useState } from "react";

// DEMO-ONLY: a real deployment identifies the caller from a verified
// session (see lib/http/auth.ts), never from a client-supplied header.
// This constant + the x-user-id header below exist so this page has
// something to click through against the real API without a full auth
// UI — do not carry this pattern into production.
const DEMO_STUDENT_ID = "00000000-0000-0000-0000-000000000001";

interface PublicTest {
  input: string;
  output: string;
}

interface SafeResult {
  submissionId: string;
  status: string;
  overallVerdict: string;
  score?: number;
  maxScore?: number;
  message: string;
  hiddenCategoryResults?: Record<string, { passed: number; total: number }>;
}

const VERDICT_COLOR: Record<string, string> = {
  ACCEPTED: "var(--green-400)",
  PENDING: "var(--mist-400)",
};

function verdictColor(v: string): string {
  return VERDICT_COLOR[v] ?? "var(--red-400)";
}

export function Workspace(props: {
  problemId: string;
  title: string;
  statement: string;
  publicTests: PublicTest[];
  timeLimitMs: number;
  memoryLimitMb: number;
}) {
  const [source, setSource] = useState(
    "# Read: first line 'n target', second line n integers.\n# Print: the number of pairs summing to target.\nimport sys\n\ndata = sys.stdin.read().split()\n"
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SafeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": DEMO_STUDENT_ID },
        body: JSON.stringify({
          problemId: props.problemId,
          language: "python3",
          sourceCode: source,
          idempotencyKey: `ui-${Date.now()}`,
          assessmentMode: "learning",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "submission failed");
      } else {
        setResult(body);
      }
    } catch {
      setError("Could not reach the evaluation service. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "32px 40px" }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--cyan-400)", letterSpacing: 1 }}>
          HIDDEN TEST ENGINE
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: "4px 0 0" }}>{props.title}</h1>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--mist-400)", marginTop: 4 }}>
          limits: {props.timeLimitMs}ms · {props.memoryLimitMb}MB
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(280px,340px)", gap: 20, alignItems: "start" }}>
        {/* Left: statement + public tests */}
        <section style={panelStyle}>
          <PanelHeader label="Problem" accent="var(--cyan-400)" />
          <p style={{ lineHeight: 1.6, color: "var(--paper-100)", fontSize: 14 }}>{props.statement}</p>
          <div style={{ marginTop: 18 }}>
            <div style={sectionLabelStyle}>
              <UnlockIcon /> Public tests — visible to you
            </div>
            {props.publicTests.map((t, i) => (
              <div key={i} style={{ ...codeBlockStyle, marginTop: 10 }}>
                <div style={{ color: "var(--mist-400)", fontSize: 11, marginBottom: 4 }}>input</div>
                <pre style={preStyle}>{t.input}</pre>
                <div style={{ color: "var(--mist-400)", fontSize: 11, margin: "8px 0 4px" }}>expected output</div>
                <pre style={preStyle}>{t.output}</pre>
              </div>
            ))}
          </div>
        </section>

        {/* Middle: editor */}
        <section style={panelStyle}>
          <PanelHeader label="Your solution — Python 3" accent="var(--cyan-400)" />
          <textarea
            className="code-editor"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            aria-label="Python source code"
            style={{
              width: "100%",
              minHeight: 360,
              background: "var(--ink-950)",
              color: "var(--paper-100)",
              border: "1px solid var(--ink-700)",
              borderRadius: "var(--radius-sm)",
              padding: 14,
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              marginTop: 14,
              background: submitting ? "var(--ink-700)" : "var(--cyan-400)",
              color: submitting ? "var(--mist-400)" : "var(--ink-950)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 20px",
              fontWeight: 600,
              fontSize: 14,
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Running hidden evaluation…" : "Submit"}
          </button>
          {error && <p style={{ color: "var(--red-400)", fontSize: 13, marginTop: 10 }}>{error}</p>}
        </section>

        {/* Right: sealed hidden-evaluation panel */}
        <section style={panelStyle}>
          <PanelHeader label="Hidden evaluation" accent="var(--amber-400)" />
          {!result && !submitting && (
            <div style={{ textAlign: "center", padding: "28px 8px", color: "var(--mist-500)" }}>
              <SealIcon cracked={false} />
              <p style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
                Unseen inputs stay sealed until you submit. You'll see whether you passed — never what proved it.
              </p>
            </div>
          )}
          {submitting && (
            <div style={{ textAlign: "center", padding: "28px 8px", color: "var(--amber-300)" }}>
              <SealIcon cracked={false} spinning />
              <p style={{ fontSize: 13, marginTop: 12 }}>Executing in the sandbox…</p>
            </div>
          )}
          {result && (
            <div>
              <div style={{ textAlign: "center", padding: "12px 8px 4px" }}>
                <SealIcon cracked />
              </div>
              <div
                style={{
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: verdictColor(result.overallVerdict),
                  margin: "8px 0 2px",
                }}
              >
                {result.overallVerdict}
              </div>
              {typeof result.score === "number" && (
                <div style={{ textAlign: "center", color: "var(--mist-400)", fontSize: 13, marginBottom: 12 }}>
                  {result.score} / {result.maxScore}
                </div>
              )}
              <p style={{ fontSize: 13, color: "var(--paper-100)", lineHeight: 1.5, marginBottom: 14 }}>{result.message}</p>
              {result.hiddenCategoryResults && (
                <div>
                  <div style={sectionLabelStyle}>Category results</div>
                  {Object.entries(result.hiddenCategoryResults).map(([cat, v]) => (
                    <div
                      key={cat}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        padding: "6px 0",
                        borderBottom: "1px solid var(--ink-800)",
                      }}
                    >
                      <span style={{ color: "var(--paper-100)", textTransform: "capitalize" }}>{cat}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: v.passed === v.total ? "var(--green-400)" : "var(--red-400)" }}>
                        {v.passed}/{v.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PanelHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: accent, display: "inline-block" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 0.5, color: "var(--mist-400)" }}>
        {label.toUpperCase()}
      </span>
    </div>
  );
}

function UnlockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4, verticalAlign: -2 }}>
      <rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SealIcon({ cracked, spinning }: { cracked: boolean; spinning?: boolean }) {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      style={{ animation: spinning ? "hte-pulse 1.6s ease-in-out infinite" : undefined }}
    >
      <circle cx="28" cy="28" r="24" fill="none" stroke={cracked ? "var(--green-400)" : "var(--amber-400)"} strokeWidth="2" />
      <circle cx="28" cy="28" r="24" fill={cracked ? "rgba(95,191,119,0.08)" : "rgba(232,181,76,0.08)"} />
      {cracked ? (
        <path d="M20 28l6 6 10-12" stroke="var(--green-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <path d="M28 18v8m0 4v6" stroke="var(--amber-400)" strokeWidth="2.5" strokeLinecap="round" />
      )}
      <style>{`@keyframes hte-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
    </svg>
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--ink-900)",
  border: "1px solid var(--ink-800)",
  borderRadius: "var(--radius-md)",
  padding: 20,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--mist-400)",
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
};

const codeBlockStyle: React.CSSProperties = {
  background: "var(--ink-950)",
  border: "1px solid var(--ink-800)",
  borderRadius: "var(--radius-sm)",
  padding: 10,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: "var(--paper-050)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
