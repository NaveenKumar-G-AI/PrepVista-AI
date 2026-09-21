import { InterviewReportData } from './reportBuilder';
import { escapeHtml, section } from '../shared/htmlUtils';

/** extraSectionsHtml is a deliberate extension point (used to splice in the
 *  replay timeline) rather than string-patching this function's output
 *  from outside. */
export function renderReportHtml(report: InterviewReportData, extraSectionsHtml = ''): string {
  const dimensionRows = report.dimensionResults.map(d => `
    <tr>
      <td>${escapeHtml(d.dimension.replace(/_/g, ' '))}</td>
      <td class="cf-rating cf-rating-${d.rating.toLowerCase()}">${escapeHtml(d.rating.replace(/_/g, ' '))}</td>
      <td>${escapeHtml(d.evidenceSummary)}</td>
    </tr>`).join('');

  const listItems = (items: string[]) => items.length
    ? `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    : '<p class="cf-empty">None recorded.</p>';

  const evidenceItems = report.keyEvidence.length
    ? `<ul>${report.keyEvidence.map(e => `<li><strong>${escapeHtml(e.label)}:</strong> ${escapeHtml(e.detail)}</li>`).join('')}</ul>`
    : '<p class="cf-empty">No key evidence recorded.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Technical Interview Report — ${escapeHtml(report.targetRole)}</title>
<style>${DEFAULT_REPORT_CSS}</style>
</head>
<body>
<main class="cf-report">
  <header class="cf-report-header">
    <h1>Technical Interview Report</h1>
    <dl>
      <dt>Target role</dt><dd>${escapeHtml(report.targetRole)}</dd>
      <dt>Interview type</dt><dd>${escapeHtml(report.interviewType.replace(/_/g, ' '))}</dd>
      <dt>Date</dt><dd>${escapeHtml(new Date(report.interviewDate).toLocaleString())}</dd>
      <dt>Overall readiness</dt><dd class="cf-readiness cf-readiness-${report.overallReadiness.toLowerCase()}">${escapeHtml(report.overallReadiness.replace(/_/g, ' '))}</dd>
      <dt>Evidence confidence</dt><dd>${escapeHtml(report.evidenceConfidence)}</dd>
    </dl>
  </header>

  ${section('Dimension results', `<table class="cf-dimension-table"><thead><tr><th>Dimension</th><th>Rating</th><th>Evidence</th></tr></thead><tbody>${dimensionRows}</tbody></table>`)}
  ${section('Strengths', listItems(report.strengths))}
  ${section('Critical gaps', listItems(report.criticalGaps))}
  ${section('Key evidence', evidenceItems)}
  ${section('What to improve', listItems(report.whatToImprove))}
  ${section('Next recommended action', `<p>${escapeHtml(report.nextRecommendedAction)}</p>`)}
  ${section('Roadmap impact', `<p>${escapeHtml(report.roadmapImpact)}</p>`)}
  ${section('Next interview / verification', `<p>${escapeHtml(report.nextInterviewRecommendation)}</p>`)}
  ${extraSectionsHtml}
</main>
</body>
</html>`;
}

const DEFAULT_REPORT_CSS = `
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f6f7f9; color: #1a1a1a; margin: 0; padding: 2rem; }
  .cf-report { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 2.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .cf-report-header dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; margin: 1rem 0 2rem; }
  .cf-report-header dt { font-weight: 600; color: #555; }
  .cf-report-section { margin-bottom: 2rem; }
  .cf-report-section h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 1px solid #eee; padding-bottom: 0.4rem; }
  table.cf-dimension-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  table.cf-dimension-table th, table.cf-dimension-table td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #f0f0f0; }
  .cf-rating-strong { color: #0a7a3d; font-weight: 600; }
  .cf-rating-competent { color: #1a6dbf; font-weight: 600; }
  .cf-rating-developing { color: #b8860b; font-weight: 600; }
  .cf-rating-weak { color: #c0392b; font-weight: 600; }
  .cf-rating-insufficient_evidence { color: #888; font-weight: 600; }
  .cf-readiness { font-weight: 700; }
  .cf-empty { color: #999; font-style: italic; }
  .cf-timeline-list { list-style: none; padding: 0; border-left: 2px solid #eee; margin-left: 0.4rem; }
  .cf-timeline-entry { padding: 0.35rem 0 0.35rem 1rem; font-size: 0.9rem; }
  .cf-timeline-offset { font-variant-numeric: tabular-nums; color: #888; margin-right: 0.75rem; }
`;
