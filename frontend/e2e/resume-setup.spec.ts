import { test, expect } from '@playwright/test';

const user = { id: 'owner', email: 'student@example.invalid', full_name: 'Test Student', plan: 'free', active_plan: 'free', highest_owned_plan: 'free', effective_plan: 'free', owned_plans: ['free'], expired_plans: [], is_admin: false, is_org_admin: false, org_student: false, onboarding_completed: true, usage: { plan: 'free', used: 0, limit: 2, remaining: 2 } };

test('resume preparation failure retains selected upload and can be retried', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pv_access_token', 'test.payload.signature'));
  let submissions = 0;
  await page.route('https://**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me') return route.fulfill({ json: user });
    if (path === '/interviews/setup') {
      submissions++;
      return route.fulfill({ status: 503, json: { detail: 'We could read your resume, but could not prepare its interview profile. No interview was started. Your selected file is still available on this page; please try again shortly.' } });
    }
    return route.fulfill({ status: 503, json: { detail: 'Fixture service unavailable' } });
  });
  await page.goto('/interview/setup');
  await expect(page.getByRole('button', { name: 'Choose resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start Interview', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose your resume' })).toBeVisible();
  // Browsers may give PDFs no MIME type; filename is a UI hint and the server
  // remains responsible for validating content/magic bytes.
  await page.locator('input[type=file]').setInputFiles({ name: 'student.pdf', mimeType: '', buffer: Buffer.from('%PDF-fixture') });
  await page.getByRole('button', { name: 'Start Interview', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No interview was started' })).toBeVisible();
  await expect(page.getByText('student.pdf', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/interview\/setup$/);
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Start Interview', exact: true }).click();
  await expect.poll(() => submissions).toBe(2);
});
