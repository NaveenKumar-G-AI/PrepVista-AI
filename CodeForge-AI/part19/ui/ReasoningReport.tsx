"use client";

import { useState } from "react";

/**
 * Self-contained on purpose: this file duplicates the minimal shape it
 * needs from src/types.ts rather than importing across a backend/frontend
 * package boundary that may not exist in your repo layout. Once wired into
 * your monorepo, replace this block with a shared-types import.
 *
 * Design: this engine's whole job is comparing two things — what the
 * student said vs. what the code does — so the report leans on a
 * diff/code-review visual language (colored margin glyphs, monospace
 * claim/evidence pairing) instead of a generic dashboard-card look. That
 * pairing is the one deliberately bold element; everything else (score
 * ring, dimension bars) stays quiet so it doesn't compete with it.
 */

type VerificationStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "UNVERIFIED";

interface Evidence {
  description: string;
  sourceLocation: { startLine: number; endLine: number } | null;
}

interface Claim {
  claimId: string;
  claimType: string;
  originalText: string;
  importance: "CORE" | "IMPORTANT" | "SUPPORTING" | "INCIDENTAL";
}

interface ClaimVerification {
  claimId: string;
  status: VerificationStatus;
  confidence: number;
  evidence: Evidence[];
  explanation: string;
}

interface Contradiction {
  category: string;
  claimId: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  studentClaim: string;
  actualEvidence: string;
  explanation: string;
  sourceLocation: { startLine: number; endLine: number } | null;
}

interface FollowUpQuestion {
  type: string;
  question: string;
  targetClaimId: string | null;
}

interface DimensionScore {
  dimension: string;
  score: number;
  reason: string;
}

export interface ReasoningReportData {
  score: {
    overall: number;
    band: string;
    dimensions: DimensionScore[];
    confidence: "High" | "Medium" | "Low";
  };
  claims: Claim[];
  verifications: ClaimVerification[];
  agreements: string[];
  contradictions: Contradiction[];
  followUpQuestions: FollowUpQuestion[];
  understanding: "STRONG" | "SOLID" | "PARTIAL" | "WEAK";
}

const FONT_SANS =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO =
  '"JetBrains Mono", ui-monospace, "SF Mono", "Fira Code", Menlo, Consolas, monospace';

const VERDICT: Record<VerificationStatus, { glyph: string; color: string; label: string }> = {
  SUPPORTED: { glyph: "+", color: "#5FD98A", label: "Matches" },
  PARTIALLY_SUPPORTED: { glyph: "~", color: "#E8B44C", label: "Partial" },
  CONTRADICTED: { glyph: "\u2212", color: "#F26B5E", label: "Mismatch" },
  UNVERIFIED: { glyph: "?", color: "#6B7280", label: "Unverified" },
};

const SEVERITY_COLOR: Record<Contradiction["severity"], string> = {
  HIGH: "#F26B5E",
  MEDIUM: "#E8B44C",
  LOW: "#6B7280",
};

function ScoreRing({ score, band }: { score: number; band: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const ringColor = score >= 80 ? "#5FD98A" : score >= 60 ? "#7C8CFF" : score >= 40 ? "#E8B44C" : "#F26B5E";
  return (
    <div className="flex items-center gap-5">
      <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#242832" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
        <text x="50" y="47" textAnchor="middle" fontSize="24" fontWeight={700} fill="#E6E8EB" style={{ fontFamily: FONT_MONO }}>
          {score}
        </text>
        <text x="50" y="64" textAnchor="middle" fontSize="9" fill="#8B93A1" style={{ fontFamily: FONT_SANS }}>
          / 100
        </text>
      </svg>
      <div>
        <div className="text-xs uppercase tracking-wider" style={{ color: "#8B93A1", fontFamily: FONT_SANS }}>
          Reasoning verification
        </div>
        <div className="text-xl font-semibold" style={{ color: ringColor, fontFamily: FONT_SANS }}>
          {band}
        </div>
      </div>
    </div>
  );
}

function DimensionBar({ dim }: { dim: DimensionScore }) {
  const color = dim.score >= 80 ? "#5FD98A" : dim.score >= 60 ? "#7C8CFF" : dim.score >= 40 ? "#E8B44C" : "#F26B5E";
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm" style={{ color: "#E6E8EB", fontFamily: FONT_SANS }}>
          {dim.dimension}
        </span>
        <span className="text-sm font-mono" style={{ color, fontFamily: FONT_MONO }}>
          {dim.score}
        </span>
      </div>
      <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: "#242832" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${dim.score}%`, backgroundColor: color, transition: "width 400ms ease" }} />
      </div>
    </div>
  );
}

/** The signature element: a two-line diff-style comparison of what the
 *  student claimed against what the evidence shows. */
function ComparisonRow({
  glyph,
  color,
  claimText,
  evidenceText,
  footer,
}: {
  glyph: string;
  color: string;
  claimText: string;
  evidenceText: string;
  footer?: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border-l-2 pl-3 py-2" style={{ borderColor: color, backgroundColor: "#15171D" }}>
      <div
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: `${color}26`, color, fontFamily: FONT_MONO }}
      >
        {glyph}
      </div>
      <div className="flex-1 min-w-0 space-y-1" style={{ fontFamily: FONT_MONO, fontSize: "13px" }}>
        <div style={{ color: "#8B93A1" }}>
          <span style={{ color: "#5A6270" }}>you said </span>
          <span style={{ color: "#C7CCD4" }}>{claimText}</span>
        </div>
        <div>
          <span style={{ color: "#5A6270" }}>evidence </span>
          <span style={{ color }}>{evidenceText}</span>
        </div>
        {footer ? (
          <div className="pt-0.5" style={{ color: "#8B93A1", fontFamily: FONT_SANS, fontSize: "12.5px" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ReasoningReport({ report }: { report: ReasoningReportData }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const verificationByClaimId = new Map(report.verifications.map((v) => [v.claimId, v]));

  return (
    <div
      className="w-full max-w-3xl mx-auto rounded-2xl p-6 space-y-6"
      style={{ backgroundColor: "#111318", border: "1px solid #242832", fontFamily: FONT_SANS }}
    >
      <ScoreRing score={report.score.overall} band={report.score.band} />

      <div>
        {report.score.dimensions.map((dim) => (
          <DimensionBar key={dim.dimension} dim={dim} />
        ))}
      </div>

      {report.agreements.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider mb-2" style={{ color: "#5FD98A" }}>
            What you understood well
          </h3>
          <div className="space-y-2">
            {report.agreements.map((line, i) => (
              <div key={i} className="text-sm flex gap-2" style={{ color: "#C7CCD4" }}>
                <span style={{ color: "#5FD98A", fontFamily: FONT_MONO }}>+</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.contradictions.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider mb-2" style={{ color: "#F26B5E" }}>
            Mismatches
          </h3>
          <div className="space-y-2">
            {report.contradictions.map((c, i) => (
              <ComparisonRow
                key={i}
                glyph={VERDICT.CONTRADICTED.glyph}
                color={SEVERITY_COLOR[c.severity]}
                claimText={c.studentClaim}
                evidenceText={c.actualEvidence}
                footer={c.explanation}
              />
            ))}
          </div>
        </section>
      )}

      {report.followUpQuestions.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider mb-2" style={{ color: "#7C8CFF" }}>
            Answer these to improve your score
          </h3>
          <ol className="space-y-2">
            {report.followUpQuestions.map((q, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "#C7CCD4" }}>
                <span style={{ color: "#7C8CFF", fontFamily: FONT_MONO }}>{i + 1}.</span>
                <span>{q.question}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wider mb-2" style={{ color: "#8B93A1" }}>
          Claim explorer ({report.claims.length})
        </h3>
        <div className="space-y-1">
          {report.claims.map((claim) => {
            const v = verificationByClaimId.get(claim.claimId);
            const verdict = v ? VERDICT[v.status] : VERDICT.UNVERIFIED;
            const isOpen = expanded === claim.claimId;
            return (
              <div key={claim.claimId} className="rounded-lg overflow-hidden" style={{ backgroundColor: "#15171D" }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : claim.claimId)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left"
                  style={{ cursor: "pointer" }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: `${verdict.color}26`, color: verdict.color, fontFamily: FONT_MONO }}
                  >
                    {verdict.glyph}
                  </span>
                  <span className="text-xs uppercase tracking-wide shrink-0" style={{ color: "#5A6270", width: "8rem", fontFamily: FONT_MONO }}>
                    {claim.claimType.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm truncate" style={{ color: "#C7CCD4" }}>
                    {claim.originalText}
                  </span>
                </button>
                {isOpen && v && (
                  <div className="px-3 pb-3 pl-11 space-y-1" style={{ fontFamily: FONT_MONO, fontSize: "12.5px" }}>
                    <div style={{ color: verdict.color }}>
                      {verdict.label} · confidence {(v.confidence * 100).toFixed(0)}%
                    </div>
                    <div style={{ color: "#8B93A1" }}>{v.explanation}</div>
                    {v.evidence.map((e, i) => (
                      <div key={i} style={{ color: "#5A6270" }}>
                        evidence: {e.description}
                        {e.sourceLocation ? ` (line ${e.sourceLocation.startLine})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
