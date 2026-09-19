import { test, expect, type Page } from '@playwright/test';
import { challenges } from '../src/modules/coding/lib/challenges';
import { createHash } from 'node:crypto';

const user = { id: 'coding-owner-a', email: 'coding@example.invalid', full_name: 'Coding Student', plan: 'free', active_plan: 'free', highest_owned_plan: 'free', effective_plan: 'free', owned_plans: ['free'], expired_plans: [], is_admin: false, is_org_admin: false, org_student: false, onboarding_completed: true, usage: { plan: 'free', used: 0, limit: 2, remaining: 2 } };
test.beforeEach(({ page }) => { page.on('dialog', dialog => dialog.accept()); });
async function prepare(page: Page, enabled = true, authenticated = true, profileId = user.id) {
  if (authenticated) await page.addInitScript(() => sessionStorage.setItem('pv_access_token', 'test.payload.signature'));
  await page.route('**/api/awake', route => route.fulfill({ json: { status: 'awake' } }));
  await page.route('https://**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me') return route.fulfill({ json: { ...user, id: profileId } });
    if (path === '/coding/access') return route.fulfill({ json: {
      schema_version: 1, student_profile_id: profileId, enabled,
      execution_language: 'javascript', result_authority: 'CLIENT_REPORTED',
      persistence: 'BROWSER_TAB', server_sync: false, ai_mentoring: false,
      readiness_updates: false, interview_credits_consumed: 0,
    } });
    return route.fulfill({ status: 503, json: { detail: 'Test service unavailable' } });
  });
}

test('anonymous and disabled accounts cannot mount the coding editor', async ({ page }) => {
  await prepare(page, false, false);
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  await expect(page.getByRole('heading', { name: 'Sign in to practise coding' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your JavaScript solution' })).toHaveCount(0);
  await prepare(page, false, true);
  await page.reload();
  await expect(page.getByText('It is not enabled for your account yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your JavaScript solution' })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`students switch workspaces and recover their coding draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    const challenge = challenges[0];
    await page.goto(`/coding/practice/${challenge.challengeId}`);
    const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
    await expect(editor).toBeEnabled();
    await editor.fill('// Keep this draft when switching workspaces');
    const switcher = page.getByRole('group', { name: 'Student workspaces' });
    await expect(switcher.getByRole('link', { name: 'Coding', exact: true })).toHaveAttribute('aria-current', 'page');
    await switcher.getByRole('link', { name: 'Interview', exact: true }).click();
    await expect(page).toHaveURL(/\/interview\/setup$/);
    await expect(switcher.getByRole('link', { name: 'Interview', exact: true })).toHaveAttribute('aria-current', 'page');
    await switcher.getByRole('link', { name: 'Coding', exact: true }).click();
    await expect(page).toHaveURL(/\/coding$/);
    await page.getByRole('link', { name: challenge.title, exact: true }).click();
    await expect(editor).toHaveValue('// Keep this draft when switching workspaces');
  });
}

test('catalog, actual checks, stale results and tab recovery form one practice slice', async ({ page }) => {
  await prepare(page);
  const mutations: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') mutations.push(new URL(request.url()).pathname); });
  await page.goto('/coding');
  await expect(page.getByRole('status').filter({ hasText: '19 problems' })).toBeVisible();
  const challenge = challenges[0];
  await page.getByRole('link', { name: challenge.title, exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await expect(editor).toBeEnabled();
  await editor.fill(challenge.solutionMetadata.referenceSolution.javascript!);
  await page.getByRole('button', { name: 'Run practice checks' }).click();
  const total = challenge.publicTests.length + challenge.hiddenTests.length;
  await expect(page.getByRole('heading', { name: `${total} of ${total} practice checks passed` })).toBeVisible();
  await editor.fill(`${challenge.solutionMetadata.referenceSolution.javascript}\n// updated draft`);
  await expect(page.getByText('These results are for an earlier draft.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your explanation' }).fill('I checked empty input and repeated values.');
  await page.reload();
  await expect(editor).toHaveValue(/updated draft/);
  await expect(page.getByRole('textbox', { name: 'Your explanation' })).toHaveValue('I checked empty input and repeated values.');
  await expect(page.getByText('practice checks passed', { exact: false })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download work', exact: true }).click();
  expect((await download).suggestedFilename()).toBe(`prepvista-${challenge.challengeId}.json`);
  expect(mutations).toEqual([]);
});

test('production worker executes all 19 reference solutions with its own CSP', async ({ page }) => {
  test.setTimeout(60000);
  await prepare(page);
  await page.goto('/coding');
  const asset = await page.request.get('/coding-assets/runner-v1.js');
  expect(asset.status()).toBe(200);
  expect(asset.headers()['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(asset.headers()['content-security-policy']).toContain("connect-src 'none'");
  const notices = await page.request.get('/coding-assets/runner-v1.NOTICES.txt');
  const manifestResponse = await page.request.get('/coding-assets/runner-v1.manifest.json');
  expect(notices.status()).toBe(200); expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.bundle_sha256).toBe(createHash('sha256').update(await asset.body()).digest('hex'));
  expect(manifest.notices_sha256).toBe(createHash('sha256').update(await notices.body()).digest('hex'));
  expect(await notices.text()).toContain('Fabrice Bellard');
  expect(await notices.text()).toContain('Jake Teton-Landis');
  expect(manifest.packages.some((item: { name: string }) => item.name === '@jitl/quickjs-singlefile-browser-release-sync')).toBe(true);
  const interview = await page.request.get('/interview/setup');
  expect(interview.headers()['permissions-policy']).toContain('microphone=(self)');
  expect(interview.headers()['content-security-policy']).not.toContain('wasm-unsafe-eval');
  for (const challenge of challenges) {
    const results = await page.evaluate(request => new Promise<{ passed: boolean; error?: string }[]>((resolve, reject) => {
      const worker = new Worker('/coding-assets/runner-v1.js');
      const deadline = setTimeout(() => { worker.terminate(); reject(new Error('Worker deadline exceeded')); }, 15000);
      worker.onmessage = event => { clearTimeout(deadline); worker.terminate(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.results); };
      worker.onerror = () => { clearTimeout(deadline); worker.terminate(); reject(new Error('Worker failed')); };
      worker.postMessage(request);
    }), { code: challenge.solutionMetadata.referenceSolution.javascript!, entry: challenge.evaluationMetadata.entryFunction, comparison: challenge.evaluationMetadata.comparisonMode, tests: [...challenge.publicTests, ...challenge.hiddenTests] });
    expect(results.length, challenge.title).toBeGreaterThan(0);
    expect(results.every(result => result.passed), `${challenge.title}: ${JSON.stringify(results)}`).toBe(true);
  }
});

test('runner interrupts loops, exposes no host APIs, and cancellation keeps code', async ({ page }) => {
  await prepare(page);
  const challenge = challenges[0];
  await page.goto(`/coding/practice/${challenge.challengeId}`);
  const outcome = await page.evaluate(() => new Promise<{ passed: boolean }[]>((resolve, reject) => {
    const worker = new Worker('/coding-assets/runner-v1.js');
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Unbounded runner')); }, 10000);
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); resolve(event.data.results); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Runner failed')); };
    worker.postMessage({ code: 'function probe(){ return [typeof fetch, typeof document, typeof process, typeof localStorage, typeof postMessage, typeof require]; }', entry: 'probe', comparison: 'exact', tests: [{ id: 'host', input: [], expectedOutput: Array(6).fill('undefined'), category: 'NORMAL' }] });
  }));
  expect(outcome[0].passed).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await expect(editor).toBeEnabled();
  const infinite = `function ${challenge.evaluationMetadata.entryFunction}(){ while(true){} }`;
  await editor.fill(infinite);
  await page.getByRole('button', { name: 'Run practice checks' }).click();
  await expect(page.getByText('Check 1: Timeout')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Run practice checks' }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Run cancelled' })).toBeVisible();
  await expect(editor).toHaveValue(infinite);
});

test('another account cannot recover the previous account draft', async ({ page }) => {
  await prepare(page);
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await expect(editor).toBeEnabled();
  await editor.fill('// account A private draft');
  await prepare(page, true, true, 'coding-owner-b');
  await page.reload();
  await expect(editor).toHaveValue(challenges[0].starterCode.javascript!);
  await expect(page.getByText('account A private draft')).toHaveCount(0);
  await editor.fill('// account B private draft');
  await page.getByRole('button', { name: 'Sign out of your account' }).click();
  await page.getByRole('button', { name: 'Click again to confirm sign out' }).click();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('pv_coding_draft_v1:')))).toEqual([]);
});

test('narrow screens and unavailable access preserve a usable fallback', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  await expect(page.getByRole('textbox', { name: 'Your JavaScript solution' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.route('**/coding/access', route => route.fulfill({ status: 503, json: { detail: 'Offline' } }));
  await page.reload();
  await expect(page.getByText('Coding practice is temporarily unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to my dashboard' })).toBeVisible();
});
