import { test, run, assert } from './testHarness.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubmissionStatusPanel, type SubmissionResultView } from '../src/frontend/SubmissionStatusPanel.js';
import { SubmitButton } from '../src/frontend/SubmitButton.js';
import { SubmissionHistoryPanel } from '../src/frontend/SubmissionHistoryPanel.js';
import type { SubmissionStatus } from '../src/domain/enums.js';

const ACCEPTED_RESULT: SubmissionResultView = {
  verdict: 'ACCEPTED',
  score: 100,
  compilationStatus: 'SUCCESS',
  compilationOutput: null,
  publicResult: { totalTests: 2, passed: 2, failed: 0, cases: [{ name: 'sample-1', passed: true, wallMs: 12 }, { name: 'sample-2', passed: true, wallMs: 9 }] },
  hiddenResult: { totalGroups: 3, passedGroups: 3, totalWeight: 100, earnedWeight: 100 },
  resourceUsage: { cpuMs: 40, memoryKb: 9216, wallMs: 55, outputBytes: 12 },
  terminationReason: null,
};

const WRONG_ANSWER_RESULT: SubmissionResultView = {
  ...ACCEPTED_RESULT,
  verdict: 'WRONG_ANSWER',
  score: 33.33,
  publicResult: { totalTests: 2, passed: 1, failed: 1, cases: [{ name: 'sample-1', passed: true, wallMs: 10 }, { name: 'sample-2', passed: false, wallMs: 11 }] },
  hiddenResult: { totalGroups: 3, passedGroups: 1, totalWeight: 100, earnedWeight: 33.33 },
};

const COMPILE_ERROR_RESULT: SubmissionResultView = {
  ...ACCEPTED_RESULT,
  verdict: 'COMPILATION_ERROR',
  score: 0,
  compilationStatus: 'FAILED',
  compilationOutput: 'main.c:2:5: error: expected \';\' before \'}\' token',
  publicResult: { totalTests: 0, passed: 0, failed: 0, cases: [] },
  hiddenResult: { totalGroups: 0, passedGroups: 0, totalWeight: 0, earnedWeight: 0 },
};

const STATES_TO_RENDER: { status: SubmissionStatus; result: SubmissionResultView | null }[] = [
  { status: 'SUBMITTED', result: null },
  { status: 'QUEUED', result: null },
  { status: 'COMPILING', result: null },
  { status: 'RUNNING', result: null },
  { status: 'EVALUATING', result: null },
  { status: 'COMPLETED', result: ACCEPTED_RESULT },
  { status: 'COMPLETED', result: WRONG_ANSWER_RESULT },
  { status: 'COMPLETED', result: COMPILE_ERROR_RESULT },
  { status: 'JUDGE_ERROR', result: null },
  { status: 'CANCELLED', result: null },
  { status: 'EXPIRED', result: null },
  { status: 'FAILED', result: null },
];

for (const { status, result } of STATES_TO_RENDER) {
  test(`SubmissionStatusPanel renders without crashing for status=${status}${result ? ` verdict=${result.verdict}` : ''}`, () => {
    const html = renderToStaticMarkup(
      createElement(SubmissionStatusPanel, { status, submissionNumber: 3, language: 'python', result }),
    );
    assert.ok(html.length > 0);
    assert.ok(html.includes('Submission #3'));
  });
}

test('non-color-only: an ACCEPTED result renders the word "Accepted" in text, not just a colored element', () => {
  const html = renderToStaticMarkup(createElement(SubmissionStatusPanel, { status: 'COMPLETED', submissionNumber: 1, language: 'python', result: ACCEPTED_RESULT }));
  assert.match(html, /Accepted/);
});

test('non-color-only: a WRONG_ANSWER result renders the words "Wrong Answer" in text', () => {
  const html = renderToStaticMarkup(createElement(SubmissionStatusPanel, { status: 'COMPLETED', submissionNumber: 1, language: 'python', result: WRONG_ANSWER_RESULT }));
  assert.match(html, /Wrong Answer/);
});

test('JUDGE_ERROR renders the exact spec-mandated reassurance message, verbatim', () => {
  const html = renderToStaticMarkup(createElement(SubmissionStatusPanel, { status: 'JUDGE_ERROR', submissionNumber: 1, language: 'python', result: null }));
  assert.match(html, /Your code was not marked incorrect/);
});

test('a compile error surfaces real compiler output text to the student', () => {
  const html = renderToStaticMarkup(createElement(SubmissionStatusPanel, { status: 'COMPLETED', submissionNumber: 1, language: 'c', result: COMPILE_ERROR_RESULT }));
  assert.match(html, /expected/);
});

test('accessibility: the live status region has role="status" and aria-live="polite"', () => {
  const html = renderToStaticMarkup(createElement(SubmissionStatusPanel, { status: 'RUNNING', submissionNumber: 1, language: 'python', result: null }));
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
});

test('a non-terminal state never renders fabricated result content', () => {
  const html = renderToStaticMarkup(createElement(SubmissionStatusPanel, { status: 'RUNNING', submissionNumber: 1, language: 'python', result: null }));
  // Check for the actual rendered element's class attribute, not a bare substring —
  // "cf-result" also appears inside the embedded <style> tag's CSS selector
  // (.cf-result { ... }) on every render regardless of state, so a naive substring
  // check would false-negative here even though the component is correct.
  assert.ok(!html.includes('class="cf-result"'));
});

test('SubmitButton renders and reflects a disabled reason in visible text (not color-only)', () => {
  const html = renderToStaticMarkup(createElement(SubmitButton, { onSubmit: async () => {}, disabledReason: 'Deadline passed' }));
  assert.match(html, /Deadline passed/);
  assert.match(html, /disabled=""/);
});

test('SubmitButton renders enabled with "Submit" when no disabled reason is given', () => {
  const html = renderToStaticMarkup(createElement(SubmitButton, { onSubmit: async () => {} }));
  assert.match(html, />Submit</);
});

test('SubmissionHistoryPanel renders an empty state without crashing', () => {
  const html = renderToStaticMarkup(createElement(SubmissionHistoryPanel, { rows: [] }));
  assert.match(html, /No submissions yet/);
});

test('SubmissionHistoryPanel renders real rows with verdict short codes', () => {
  const html = renderToStaticMarkup(
    createElement(SubmissionHistoryPanel, {
      rows: [
        { id: 's1', submissionNumber: 1, language: 'python', createdAt: new Date().toISOString(), status: 'COMPLETED', verdict: 'ACCEPTED', score: 100 },
        { id: 's2', submissionNumber: 2, language: 'cpp', createdAt: new Date().toISOString(), status: 'COMPLETED', verdict: 'WRONG_ANSWER', score: 20 },
      ],
    }),
  );
  assert.match(html, /AC/);
  assert.match(html, /WA/);
  assert.match(html, /100%/);
});

await run('reactRender.test.ts');
