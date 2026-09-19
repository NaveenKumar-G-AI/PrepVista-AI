import { test, expect, type Page } from '@playwright/test';
const sid = '11111111-1111-4111-8111-111111111111';
const user = { id: 'owner', email: 'test@example.invalid', full_name: 'Test Student', plan: 'free', active_plan: 'free', highest_owned_plan: 'free', effective_plan: 'free', owned_plans: ['free'], expired_plans: [], is_admin: false, is_org_admin: false, org_student: false, onboarding_completed: true, usage: { plan: 'free', used: 0, limit: 2, remaining: 2 } };
async function prepare(page: Page, authenticated = true, turn = 0, duration?: number) {
  await page.addInitScript(({ authenticated, sid, duration }) => {
    if (authenticated) {
      sessionStorage.setItem('pv_access_token', 'test.payload.signature');
      sessionStorage.setItem('pv_interview_session', JSON.stringify({ session_id: sid, access_token: 'session-token-is-not-the-auth-jwt', max_turns: 5, plan: 'free', candidate_name: 'Test Student', duration_seconds: duration }));
    }
    class Recognition {
      onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void;
      start() { Object.assign(window, { testRecognition: this }); this.onstart?.(); }
      stop() { setTimeout(() => { this.onend?.(); }, 20); }
    }
    Object.assign(window, { SpeechRecognition: Recognition, webkitSpeechRecognition: Recognition });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => new MediaStream() });
    Object.defineProperty(window.speechSynthesis, 'speak', { value: (utterance: SpeechSynthesisUtterance) => setTimeout(() => utterance.onend?.(new SpeechSynthesisEvent('end', { utterance })), 20) });
  }, { authenticated, sid, duration });
  await page.route('https://**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me') return route.fulfill({ json: user });
    if (path.endsWith('/state')) return route.fulfill({ json: { state: 'ACTIVE', turn, max_turns: 5, messages: turn ? [{ role: 'assistant', content: 'Describe your project.', turn_number: turn }] : [] } });
    if (path === '/dashboard/sessions') return route.fulfill({ json: { sessions: [], total: 0 } });
    return route.fulfill({ status: 503, json: { detail: 'Test service unavailable' } });
  });
}
async function begin(page: Page) {
  await page.goto(`/interview/${sid}`);
  await page.getByRole('button', { name: 'Validate And Start Session' }).click();
  await expect(page.getByRole('button', { name: 'Submit Answer', exact: true })).toBeVisible();
}
async function speakAnswer(page: Page, text: string) {
  await page.evaluate(text => {
    const recognition = (window as unknown as { testRecognition: { onresult: (event: unknown) => void } }).testRecognition;
    recognition.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }] });
  }, text);
}
test('live answer is sent, next question records, and end saves final answer', async ({ page }) => {
  await prepare(page);
  const answers: Record<string, unknown>[] = [];
  await page.route('**/interviews/*/answer', async route => {
    const answer = route.request().postDataJSON(); answers.push(answer);
    return route.fulfill({ json: answer.end_interview ? { action: 'finish', report_url: `/report/${sid}` } : { action: 'continue', text: 'Describe your project.', turn: answers.length, max_turns: 5, remaining_turns: 4 } });
  });
  await begin(page);
  await speakAnswer(page, 'I built a queue to process tasks.');
  await page.getByRole('button', { name: 'Submit Answer', exact: true }).click();
  await expect.poll(() => answers.length).toBe(2);
  expect(answers[1].user_text).toContain('queue');
  expect(answers[1].expected_turn).toBe(1);
  await expect(page.getByRole('button', { name: 'Submit Answer', exact: true })).toBeVisible();
  await speakAnswer(page, 'I added retries for failed tasks.');
  await page.getByRole('button', { name: 'End Interview', exact: true }).click();
  await page.getByRole('button', { name: 'End interview now' }).click();
  await expect.poll(() => answers.length).toBe(3);
  expect(answers[2].end_interview).toBe(true);
  expect(answers[2].user_text).toContain('retries');
  await expect(page).toHaveURL(new RegExp(`/report/${sid}`));
});
test('failed answer and failed finish keep the student in the interview', async ({ page }) => {
  await prepare(page, true, 1);
  const answers: Record<string, unknown>[] = [];
  await page.route('**/interviews/*/answer', route => { answers.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { detail: 'Please retry this answer' } }); });
  await begin(page); await speakAnswer(page, 'Preserve this answer.');
  await page.getByRole('button', { name: 'End Interview', exact: true }).click();
  await page.getByRole('button', { name: 'End interview now' }).click();
  await expect(page.getByText('Your answer is preserved.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/interview/${sid}`));
  await page.getByRole('button', { name: 'Submit Answer', exact: true }).click();
  await expect.poll(() => answers.length).toBe(2);
  expect(answers[1].client_request_id).toBe(answers[0].client_request_id);
  expect(answers[1].user_text).toBe(answers[0].user_text);
});
test('reload resumes the current question without submitting a start token', async ({ page }) => {
  await prepare(page, true, 3);
  let submissions = 0;
  await page.route('**/interviews/*/answer', route => { submissions++; return route.fulfill({ status: 500 }); });
  await begin(page);
  await expect(page.getByText('Question 3 of 5')).toBeVisible();
  expect(submissions).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: 'Validate And Start Session' }).click();
  await expect(page.getByRole('button', { name: 'Submit Answer', exact: true })).toBeVisible();
  expect(submissions).toBe(0);
});
test('login error query with a literal percent does not crash', async ({ page }) => {
  await prepare(page, false);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login?error=google_failed&error_description=100%25%20failed');
  await expect(page.getByText('100% failed')).toBeVisible();
  expect(errors).toEqual([]);
});
test('desktop and mobile core pages handle empty data and service failures', async ({ page }) => {
  await prepare(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/dashboard', '/history', '/interview/setup', '/profile', '/settings', '/analytics', '/pricing']) {
      await page.goto(path);
      await expect(page.locator('body')).not.toContainText('Application error:');
      await expect(page.locator('main').or(page.locator('h1')).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${path} overflow at ${width}`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('V2 setup exposes modes and custom coverage without losing the resume form', async ({ page }) => {
  await prepare(page);
  await page.goto('/interview/setup');
  await page.getByRole('combobox', { name: 'Interview mode', exact: true }).selectOption('quick');
  await expect(page.getByLabel('Duration in minutes')).toHaveValue('9');
  await page.getByLabel('Target role', { exact: true }).fill('Backend Engineer');
  await page.getByRole('combobox', { name: 'Interview mode', exact: true }).selectOption('custom');
  await page.getByRole('checkbox', { name: 'teamwork', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'teamwork', exact: true })).toBeChecked();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
});

test('V2 report shows source evidence and saves a retry on mobile', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const evidenceReport = {
    version: 2, evidence_state: 'DEVELOPING', confidence: 'limited', partial: false,
    numeric_evaluation_status: 'unavailable',
    blueprint: { mode: 'standard', target_role: 'Backend Engineer', plan_limited: true, target_primary_questions: 4 },
    primary_count: 4, followup_count: 1,
    coverage: { PROJECT: { asked: 2, answered: 2, state: 'EARLY_SIGNAL', evidence_ids: ['e-q-2'] } },
    evidence: [{ evidence_id: 'e-q-2', question_id: 'q-2', excerpt: 'We built the cache together.', status: 'EARLY_SIGNAL', signals: [], gaps: ['ownership'], confidence: 'limited' }],
    questions: [{ id: 'q-2', text: 'What did you personally build?', type: 'PRIMARY', family: 'PROJECT' }],
    resume_claims: [{ claim_id: 'redis', claim_text: 'Redis', verification_status: 'UNCLEAR', evidence_ids: ['e-q-2'] }],
    top_risks: [{ gap: 'ownership', question_id: 'q-2', evidence_id: 'e-q-2', excerpt: 'We built the cache together.' }],
    missions: [{ id: 'm-1', question_id: 'q-2', question: 'What did you personally build?', gap: 'ownership', instruction: 'Add your actual personal action.' }],
    not_planned: ['TEAMWORK'], content_note: 'Textual signals do not establish technical correctness.', delivery_note: 'Audio delivery is not assessed.'
  };
  await page.route(`**/reports/${sid}`, route => route.fulfill({ json: {
    session: { id: sid, plan: 'free', final_score: 0, total_turns: 5, created_at: '2026-09-11', strengths: [], weaknesses: [], rubric_scores: {} },
    evaluations: [], has_premium_access: false, evidence_report: evidenceReport
  } }));
  let retry: Record<string, unknown> | undefined;
  await page.route('**/interviews/*/retry-answer', route => {
    retry = route.request().postDataJSON();
    return route.fulfill({ json: { message: 'New textual evidence addresses: ownership', remaining_gaps: [] } });
  });
  await page.goto(`/report/${sid}`);
  await expect(page.getByRole('heading', { name: 'What this interview showed' })).toBeVisible();
  await expect(page.getByText('Numeric evaluation unavailable.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry this answer' }).first().click();
  await page.getByLabel('Use only your actual experience').first().fill('I implemented cache invalidation and tested stale reads.');
  await page.getByRole('button', { name: 'Save and compare' }).first().click();
  await expect(page.getByText('New textual evidence addresses: ownership')).toBeVisible();
  expect(retry?.question_id).toBe('q-2');
  expect(retry?.client_request_id).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});

test('V2 reload keeps elapsed time and finishes an expired session once', async ({ page }) => {
  await prepare(page, true, 3, 1);
  await page.route('**/interviews/*/state', route => route.fulfill({ json: {
    state: 'ACTIVE', turn: 3, max_turns: 5, elapsed_seconds: 2,
    progress: { primary_questions: 2, target_primary_questions: 4, phase: 'AWAITING_ANSWER', question_type: 'FOLLOWUP' },
    messages: [{ role: 'assistant', content: 'What did you personally build?', turn_number: 3 }]
  } }));
  const answers: Record<string, unknown>[] = [];
  await page.route('**/interviews/*/answer', route => {
    answers.push(route.request().postDataJSON());
    return route.fulfill({ json: { action: 'finish', report_url: `/report/${sid}` } });
  });
  await page.goto(`/interview/${sid}`);
  await page.getByRole('button', { name: 'Validate And Start Session' }).click();
  await expect(page).toHaveURL(new RegExp(`/report/${sid}`));
  expect(answers).toHaveLength(1);
  expect(answers[0].end_interview).toBe(true);
  expect(answers[0].expected_turn).toBe(3);
});
