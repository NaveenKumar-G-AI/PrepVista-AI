/**
 * Demo/fixture script — not part of the production API surface.
 * Runs PHASE 64's own end-to-end demonstration scenario (strong across the
 * board except complexity reasoning) through the real evaluation, report,
 * and replay modules and writes actual HTML — so the output can be opened
 * and inspected directly instead of taken on faith.
 *
 * Run with: node dist/examples/generateSampleReport.js
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEvaluation, computeInterviewReadinessContribution, DimensionResult } from '../evaluation/evaluationEngine';
import { buildInterviewReport, CuratedEvent } from '../reports/reportBuilder';
import { renderReportHtml } from '../reports/renderReportHtml';
import { buildReplayTimeline, ReplayEvent } from '../replay/replayTimeline';
import { renderTimelineHtml } from '../replay/renderTimelineHtml';

const dimensionResults: DimensionResult[] = [
  { dimension: 'PROBLEM_UNDERSTANDING', rating: 'STRONG', evidenceSummary: 'Restated the problem correctly on the first attempt, including the uniqueness constraint on the input array.' },
  { dimension: 'ALGORITHM_SELECTION', rating: 'STRONG', evidenceSummary: 'Proposed a HashMap-based approach after briefly considering brute force, correctly reasoning about the O(n) lookup trade-off.' },
  { dimension: 'CODING_CORRECTNESS', rating: 'STRONG', evidenceSummary: 'Final submission passed all 8 test cases, including 2 hidden edge cases.' },
  { dimension: 'DEBUGGING', rating: 'STRONG', evidenceSummary: 'Diagnosed an off-by-one error on the first failing test unaided and fixed it within one retry.' },
  { dimension: 'TIME_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'Needed a direct prompt from the interviewer before correctly stating O(n) time for the HashMap approach.' },
  { dimension: 'SPACE_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'Identified O(n) space only after the interviewer asked specifically about memory usage.' },
  { dimension: 'ADAPTABILITY', rating: 'STRONG', evidenceSummary: 'When the interviewer raised the input size from 10,000 to 10,000,000, correctly identified the HashMap approach still holds and explained why an O(n^2) alternative would not.' },
  { dimension: 'TECHNICAL_COMMUNICATION', rating: 'COMPETENT', evidenceSummary: 'Explained reasoning clearly but needed occasional prompts to elaborate on trade-offs.' },
  { dimension: 'INDEPENDENCE', rating: 'STRONG', evidenceSummary: 'Solved the problem using zero hints.' },
];

const evaluation = buildEvaluation(dimensionResults, true);
const readiness = computeInterviewReadinessContribution(evaluation);

const startedAt = '2026-08-16T10:00:00.000Z';
const events: ReplayEvent[] = [
  { id: 'e1', eventType: 'INTERVIEW_STARTED', payload: {}, createdAt: '2026-08-16T10:00:00.000Z' },
  { id: 'e2', eventType: 'PROBLEM_PRESENTED', payload: {}, createdAt: '2026-08-16T10:00:10.000Z' },
  { id: 'e3', eventType: 'CLARIFICATION_REQUESTED', payload: { question: 'What is the maximum input size?' }, createdAt: '2026-08-16T10:01:20.000Z' },
  { id: 'e4', eventType: 'PROBLEM_RESTATED', payload: {}, createdAt: '2026-08-16T10:03:10.000Z' },
  { id: 'e5', eventType: 'APPROACH_SUBMITTED', payload: {}, createdAt: '2026-08-16T10:05:30.000Z' },
  { id: 'e6', eventType: 'CODE_RUN', payload: {}, createdAt: '2026-08-16T10:08:20.000Z' },
  { id: 'e7', eventType: 'TEST_FAILED', payload: { testResults: [{ name: 'edge-empty-input', passed: false }] }, createdAt: '2026-08-16T10:13:10.000Z' },
  { id: 'e8', eventType: 'DEBUGGING_STARTED', payload: {}, createdAt: '2026-08-16T10:15:00.000Z' },
  { id: 'e9', eventType: 'TEST_PASSED', payload: { testResults: new Array(8).fill({ passed: true }) }, createdAt: '2026-08-16T10:18:30.000Z' },
  { id: 'e10', eventType: 'FOLLOWUP_ASKED', payload: { question: 'What is the time complexity?', focus: 'complexity' }, createdAt: '2026-08-16T10:19:20.000Z' },
  { id: 'e11', eventType: 'FOLLOWUP_ANSWERED', payload: { answer: 'O(n) — confirmed after being asked directly.' }, createdAt: '2026-08-16T10:20:15.000Z' },
  { id: 'e12', eventType: 'STUDENT_ADAPTED_TO_CONSTRAINT', payload: {}, createdAt: '2026-08-16T10:21:40.000Z' },
  { id: 'e13', eventType: 'INTERVIEW_COMPLETED', payload: {}, createdAt: '2026-08-16T10:23:00.000Z' },
];

const keyEvents: CuratedEvent[] = events
  .filter(e => ['TEST_FAILED', 'TEST_PASSED', 'FOLLOWUP_ASKED', 'FOLLOWUP_ANSWERED'].includes(e.eventType))
  .map(e => ({ id: e.id, eventType: e.eventType, payload: e.payload, createdAt: e.createdAt }));

const report = buildInterviewReport({
  interviewId: 'demo-interview-1',
  targetRole: 'Software Engineer',
  interviewType: 'GUIDED_TECHNICAL_INTERVIEW',
  completedAt: '2026-08-16T10:23:00.000Z',
  evaluation,
  readiness,
  keyEvents,
});

const timeline = buildReplayTimeline(startedAt, events);
const html = renderReportHtml(report, renderTimelineHtml(timeline));

const outPath = join(__dirname, '..', '..', 'sample-report.html');
writeFileSync(outPath, html, 'utf-8');

console.log(`Wrote ${outPath}`);
console.log(`Readiness: ${readiness.readinessLabel} (${readiness.confidence} confidence)`);
console.log(`Reason: ${readiness.reason}`);
console.log(`Next recommended action: ${report.nextRecommendedAction}`);
console.log(`Timeline entries: ${timeline.length}`);
