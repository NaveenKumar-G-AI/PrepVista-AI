import { test, expect, type Page } from '@playwright/test';

const user = { id: 'owner', email: 'student@example.invalid', full_name: 'Access Test', plan: 'free', active_plan: 'free', effective_plan: 'free', highest_owned_plan: 'free', owned_plans: ['free'], expired_plans: [], is_admin: false, is_org_admin: false, org_student: false, onboarding_completed: true, usage: { plan: 'free', used: 0, limit: 2, remaining: 2 } };

async function prepare(page: Page, access = true, refresh = false) {
  await page.addInitScript(({ access, refresh }) => {
    if (access) sessionStorage.setItem('pv_access_token', 'test.payload.signature');
    if (refresh) localStorage.setItem('pv_refresh_token', 'fake-refresh-token');
    sessionStorage.setItem('pv_coding_draft_v1:owner:draft', 'preserved draft');
  }, { access, refresh });
  await page.route('**/api/awake', route => route.fulfill({ json: { status: 'awake' } }));
  await page.route('https://**/*', route => route.fulfill({ status: 503, json: { detail: 'Fixture unavailable' } }));
}

for (const failure of ['server', 'network']) {
  test(`${failure} account failure preserves credentials and offers recovery`, async ({ page }) => {
    await prepare(page);
    let recovered = false;
    let dashboardCalls = 0;
    await page.route('**/auth/me', route => recovered ? route.fulfill({ json: user }) : failure === 'network' ? route.abort() : route.fulfill({ status: 503, json: { detail: 'Unavailable' } }));
    await page.route('https://**/dashboard**', route => { dashboardCalls++; return route.fulfill({ status: 503 }); });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Account access is temporarily unavailable' })).toBeVisible();
    expect(dashboardCalls).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem('pv_access_token'))).toBe('test.payload.signature');
    expect(await page.evaluate(() => sessionStorage.getItem('pv_coding_draft_v1:owner:draft'))).toBe('preserved draft');
    recovered = true;
    await page.getByRole('button', { name: 'Retry account access' }).click();
    await expect(page.getByRole('heading', { name: 'Account access is temporarily unavailable' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(() => dashboardCalls).toBeGreaterThan(0);
  });
}

for (const access of [false, true]) {
  test(`refresh outage preserves ${access ? 'expired access and' : 'restorable'} refresh credentials`, async ({ page }) => {
    await prepare(page, access, true);
    let recovered = false;
    await page.route('**/auth/refresh', route => recovered
      ? route.fulfill({ json: { access_token: 'restored.payload.signature', refresh_token: 'replacement-refresh' } })
      : route.fulfill({ status: 503, json: { detail: 'Auth temporarily unavailable' } }));
    await page.route('**/auth/me', route => route.request().headers().authorization === 'Bearer restored.payload.signature'
      ? route.fulfill({ json: user }) : route.fulfill({ status: 401, json: { detail: 'Expired' } }));
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Account access is temporarily unavailable' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pv_refresh_token'))).toBe('fake-refresh-token');
    expect(await page.evaluate(() => sessionStorage.getItem('pv_coding_draft_v1:owner:draft'))).toBe('preserved draft');
    recovered = true;
    await page.getByRole('button', { name: 'Retry account access' }).click();
    await expect(page.getByRole('heading', { name: 'Account access is temporarily unavailable' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pv_access_token'))).toBe('restored.payload.signature');
    await expect(page).toHaveURL(/\/profile$/);
  });
}

test('definitively rejected refresh clears private session and redirects to login', async ({ page }) => {
  await prepare(page, true, true);
  await page.route('**/auth/me', route => route.fulfill({ status: 401, json: { detail: 'Expired' } }));
  await page.route('**/auth/refresh', route => route.fulfill({ status: 401, json: { detail: 'Invalid refresh token' } }));
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('pv_access_token'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('pv_refresh_token'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('pv_coding_draft_v1:owner:draft'))).toBeNull();
});

for (const authenticated of [false, true]) {
  test(`public report works ${authenticated ? 'with an invalid saved session' : 'without signing in'} and excludes private answers`, async ({ page }) => {
    await prepare(page, authenticated);
    await page.route('**/auth/me', route => route.fulfill({ status: 401, json: { detail: 'Expired' } }));
    let sentAuthorization: string | undefined;
    await page.route('**/reports/shared/*', route => {
      sentAuthorization = route.request().headers().authorization;
      return route.fulfill({ json: {
        is_shared: true, evaluation_status: 'AVAILABLE', session: { plan: 'pro', final_score: 0, completed_at: '2026-09-20', summary: { answered_questions: 1 } },
        evaluations: [{ turn_number: 1, question_text: 'What did you build?', rubric_category: 'project', classification: 'insufficient', score: 0, raw_answer: 'PRIVATE ANSWER SENTINEL', ideal_answer: 'PRIVATE COACHING SENTINEL' }],
        saved_answers: [{ raw_answer: 'PRIVATE TRANSCRIPT SENTINEL' }],
      } });
    });
    await page.goto('/report/shared/example-share');
    await expect(page.getByRole('heading', { name: 'Shared interview report' })).toBeVisible();
    await expect(page.getByText('0/100', { exact: true })).toBeVisible();
    await expect(page.getByText('What did you build?')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PRIVATE');
    expect(sentAuthorization).toBeUndefined();
    await expect(page).toHaveURL(/\/report\/shared\/example-share$/);
  });
}

test('public report distinguishes expired links from recoverable service failures', async ({ page }) => {
  await prepare(page, false);
  let status = 404;
  await page.route('**/reports/shared/*', route => route.fulfill({ status, json: { detail: 'Error' } }));
  await page.goto('/report/shared/missing');
  await expect(page.getByText('This shared report was not found or its link has expired.')).toBeVisible();
  status = 503;
  await page.getByRole('button', { name: 'Retry loading report' }).click();
  await expect(page.getByText('The shared report is temporarily unavailable. Please retry.')).toBeVisible();
});
