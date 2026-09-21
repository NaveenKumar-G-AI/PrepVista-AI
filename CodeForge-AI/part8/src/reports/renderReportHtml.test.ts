import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReportHtml } from './renderReportHtml';
import { InterviewReportData } from './reportBuilder';

const sample: InterviewReportData = {
  interviewId: 'i1', targetRole: 'Software Engineer', interviewType: 'GUIDED_TECHNICAL_INTERVIEW',
  interviewDate: new Date().toISOString(), overallReadiness: 'APPROACHING_READY', evidenceConfidence: 'MEDIUM',
  dimensionResults: [{ dimension: 'TIME_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'needed prompting' }],
  strengths: ['Coding correctness: all tests passed'],
  criticalGaps: [],
  keyEvidence: [{ label: 'Hint used', detail: 'Hint level: CONCEPTUAL_DIRECTION' }],
  whatToImprove: ['Time complexity: needed prompting'],
  nextRecommendedAction: 'Complexity-focused practice.',
  roadmapImpact: 'Prioritize complexity.',
  nextInterviewRecommendation: 'A WEAKNESS_FOCUSED_INTERVIEW targeting complexity.',
};

test('renders every PHASE 28 report section', () => {
  const html = renderReportHtml(sample);
  for (const heading of ['Dimension results', 'Strengths', 'Critical gaps', 'Key evidence', 'What to improve', 'Next recommended action', 'Roadmap impact', 'Next interview / verification']) {
    assert.match(html, new RegExp(heading));
  }
});

test('a student-authored evidence string cannot inject markup into the report', () => {
  const malicious: InterviewReportData = {
    ...sample,
    dimensionResults: [{ dimension: 'CLARIFICATION', rating: 'WEAK', evidenceSummary: '<img src=x onerror=alert(1)>' }],
  };
  const html = renderReportHtml(malicious);
  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.match(html, /&lt;img/);
});

test('extraSectionsHtml is appended inside <main>, not silently dropped', () => {
  const html = renderReportHtml(sample, '<section id="marker">timeline goes here</section>');
  assert.match(html, /<section id="marker">timeline goes here<\/section>/);
  assert.ok(html.indexOf('id="marker"') < html.indexOf('</main>'));
});
