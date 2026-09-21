// ============================================================================
// Phase 59 — institutional UI. Aggregate-only: completion rates, common
// gaps, skill-verification rates. Never shows an individual student's
// response, transcript, or evaluation — the backend endpoint this calls
// (getInstitutionalReport) is typed to return only counts and skill ids,
// so there is no individual data for this component to even accidentally
// render (Phase 59: "Do not expose private student responses without
// authorization").
// ============================================================================

import { useEffect, useState } from "react";
import { interviewApi, type InstitutionalReport } from "../shared/apiClient";
import "../shared/tokens.css";
import "./InstitutionalDashboard.css";

export interface InstitutionalDashboardProps {
  roleId: string;
  roleLabel: string;
  studentIds: string[];
  skillLabels: Record<string, string>;
}

export function InstitutionalDashboard({ roleId, roleLabel, studentIds, skillLabels }: InstitutionalDashboardProps) {
  const [report, setReport] = useState<InstitutionalReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    interviewApi
      .getInstitutionalReport(roleId, studentIds)
      .then((res) => setReport(res.report))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the report."));
  }, [roleId, studentIds]);

  if (error) {
    return (
      <div className="ti-institutional ti-institutional--error" role="alert">
        {error}
      </div>
    );
  }
  if (!report) {
    return <div className="ti-institutional ti-institutional--loading">Loading cohort data…</div>;
  }

  const completionPct = Math.round(report.completionRate * 100);

  return (
    <div className="ti-institutional">
      <header className="ti-institutional__header">
        <span className="ti-institutional__eyebrow">Technical interview intelligence</span>
        <h1 className="ti-institutional__title">{roleLabel}</h1>
      </header>

      <div className="ti-institutional__stat-row">
        <div className="ti-institutional__stat">
          <span className="ti-institutional__stat-value">{report.totalSessions}</span>
          <span className="ti-institutional__stat-label">Interviews started</span>
        </div>
        <div className="ti-institutional__stat">
          <span className="ti-institutional__stat-value">{report.completedSessions}</span>
          <span className="ti-institutional__stat-label">Completed</span>
        </div>
        <div className="ti-institutional__stat">
          <span className="ti-institutional__stat-value">{completionPct}%</span>
          <span className="ti-institutional__stat-label">Completion rate</span>
        </div>
        <div className="ti-institutional__stat">
          <span className="ti-institutional__stat-value">{report.averageQuestionsPerSession.toFixed(1)}</span>
          <span className="ti-institutional__stat-label">Avg. questions / interview</span>
        </div>
      </div>

      <section className="ti-institutional__section">
        <h2 className="ti-institutional__section-title">Common gaps across this cohort</h2>
        {report.commonGapSkillIds.length === 0 ? (
          <p className="ti-institutional__empty">No recurring gaps yet — either too few completed interviews, or the cohort is covering these skills well.</p>
        ) : (
          <ol className="ti-institutional__gap-list">
            {report.commonGapSkillIds.map(({ skillId, occurrences }) => (
              <li key={skillId} className="ti-institutional__gap-row">
                <span className="ti-institutional__gap-label">{skillLabels[skillId] ?? skillId}</span>
                <span className="ti-institutional__gap-bar-track">
                  <span
                    className="ti-institutional__gap-bar-fill"
                    style={{ width: `${Math.min(100, (occurrences / Math.max(1, report.completedSessions)) * 100)}%` }}
                  />
                </span>
                <span className="ti-institutional__gap-count">{occurrences}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
