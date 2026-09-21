import { test, expect } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const user = { id, email: 'student@example.invalid', full_name: 'NAVEENKUMAR G', plan: 'pro', effective_plan: 'pro', active_plan: 'pro', highest_owned_plan: 'pro', owned_plans: ['pro'], expired_plans: [], onboarding_completed: true, usage: { used: 0, limit: 10, remaining: 10 } };

for (const count of [0, 7, 10]) {
  test(`completed report with ${count} evaluations preserves coverage and honest score`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('pv_access_token', 'test.payload.signature'));
    let retryCount = 0;
    await page.route('**/api/awake', route => route.fulfill({ json: { status: 'awake' } }));
    await page.route('https://**/*', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/auth/me') return route.fulfill({ json: user });
      if (path === `/reports/${id}/retry-evaluations`) {
        retryCount++;
        return route.fulfill({ json: { queued: 10 - count } });
      }
      if (path === `/reports/${id}`) return route.fulfill({ json: {
        session: { id, plan: 'pro', final_score: count ? 80 : null, total_turns: 10, created_at: '2026-09-19',
          strengths: [], weaknesses: [], rubric_scores: {}, summary: { planned_questions: 10, answered_questions: 10 } },
        evaluations: Array.from({ length: count }, (_, i) => ({ turn_number: i + 1, score: 8, rubric_category: 'technical_depth', question_text: `How did you test case ${i + 1}?`, raw_answer: 'I tested the edge cases.', normalized_answer: 'I tested the edge cases.', classification: 'strong', missing_elements: [] })),
        has_premium_access: false, user_plan: 'pro', has_pdf: false,
        evaluation_status: count === 10 ? 'AVAILABLE' : count ? 'PARTIAL' : 'UNAVAILABLE',
        report_state: count === 10 ? 'READY' : 'PARTIAL',
        interpretation: count ? 'The score describes evaluated answers only.' : 'Evaluation unavailable. Your recorded answers are preserved.',
      } });
      return route.fulfill({ status: 503, json: { detail: 'Fixture unavailable' } });
    });
    await page.goto(`/report/${id}`);
    await expect(page.getByText(`10 answers recorded; ${count} evaluated. Evaluation coverage: ${count * 10}%.`)).toBeVisible();
    if (!count) {
      await expect(page.getByText('Evaluation unavailable. Your recorded answers are preserved.', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Low readiness', { exact: false })).toHaveCount(0);
      await expect(page.getByText('0/100', { exact: true })).toHaveCount(0);
    } else await expect(page.getByText('80', { exact: true })).toBeVisible();
    if (count < 10) {
      await page.getByRole('button', { name: 'Retry missing evaluations' }).click();
      await expect(page.getByText(`${10 - count} saved answers queued for evaluation.`)).toBeVisible();
      expect(retryCount).toBe(1);
    }
  });
}

test('delayed evaluation preserves visible answers and can recover without a new interview', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pv_access_token', 'test.payload.signature'));
  let retried = false;
  let failRefresh = false;
  await page.route('**/api/awake', route => route.fulfill({ json: { status: 'awake' } }));
  await page.route('https://**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me') return route.fulfill({ json: user });
    if (path.endsWith('/retry-evaluations')) {
      retried = true;
      return route.fulfill({ json: { queued: 1 } });
    }
    if (path === `/reports/${id}`) {
      if (failRefresh) return route.fulfill({ status: 503, json: { detail: 'Report service temporarily unavailable' } });
      return route.fulfill({ json: {
        session: { id, plan: 'career', final_score: retried ? 80 : null, total_turns: 1,
          created_at: '2026-09-20', strengths: [], weaknesses: [], rubric_scores: {}, summary: { answered_questions: 1 } },
        evaluations: retried ? [{ turn_number: 1, score: 8, rubric_category: 'technical_depth', question_text: 'How did you debug it?', raw_answer: 'I traced the saved request and fixed the query.', normalized_answer: 'I traced the saved request and fixed the query.', classification: 'strong', missing_elements: [] }] : [],
        saved_answers: [{ turn_number: 1, question_text: 'How did you debug it?', raw_answer: 'I traced the saved request and fixed the query.', evaluation_state: retried ? 'AVAILABLE' : 'DELAYED' }],
        evaluation_status: retried ? 'AVAILABLE' : 'UNAVAILABLE', report_state: retried ? 'READY' : 'PARTIAL',
        evaluation_processing: { state: retried ? 'COMPLETE' : 'DELAYED', retryable_count: retried ? 0 : 1, jobs: retried ? [] : [{ turn_number: 1, state: 'DELAYED', error_code: 'EVALUATION_TIMEOUT', can_retry: true }] },
        has_premium_access: true, user_plan: 'career', has_pdf: false,
      } });
    }
    return route.fulfill({ status: 503 });
  });
  await page.goto(`/report/${id}`);
  await expect(page.getByText('I traced the saved request and fixed the query.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Career Answer Review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry missing evaluations' })).toBeEnabled();
  failRefresh = true;
  await page.getByRole('button', { name: 'Refresh report', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your last loaded report is still shown' })).toBeVisible();
  await expect(page.getByText('I traced the saved request and fixed the query.', { exact: true })).toBeVisible();
  failRefresh = false;
  await page.getByRole('button', { name: 'Retry missing evaluations' }).click();
  await expect(page.getByText('1 answers recorded; 1 evaluated. Evaluation coverage: 100%.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Career Answer Review' })).toBeVisible();
});

test('bounded automatic polling leaves a working manual refresh', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem('pv_access_token', 'test.payload.signature'));
  let requests = 0;
  await page.route('**/api/awake', route => route.fulfill({ json: { status: 'awake' } }));
  await page.route('https://**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me') return route.fulfill({ json: user });
    if (path === `/reports/${id}`) {
      requests++;
      return route.fulfill({ json: {
        session: { id, plan: 'career', final_score: null, total_turns: 1, created_at: '2026-09-20', strengths: [], weaknesses: [], rubric_scores: {}, summary: { answered_questions: 1 } },
        evaluations: [], evaluation_status: 'UNAVAILABLE', report_state: 'GENERATING', pending_evaluations: 1,
        has_premium_access: true, user_plan: 'career', has_pdf: false,
        evaluation_processing: { state: 'PROCESSING', retryable_count: 0, jobs: [] },
      } });
    }
    return route.fulfill({ status: 503 });
  });
  await page.goto(`/report/${id}`);
  await expect(page.getByText('Evaluating saved answers. This report updates automatically for three minutes.')).toBeVisible();
  for (let index = 0; index < 36; index++) {
    await page.clock.runFor(5050);
    await expect.poll(() => requests).toBeGreaterThan(index + 1);
  }
  await expect(page.getByText('Automatic updates paused after three minutes. Refresh to check progress; your saved answers remain available.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry missing evaluations' })).toBeDisabled();
  const before = requests;
  await page.getByRole('button', { name: 'Refresh report', exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(before);
});
