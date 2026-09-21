import { test, expect } from '@playwright/test';
import { challenges } from '../src/lib/challenges';
test('new student, persistent draft, wrong answer, hint, mentor failure, navigation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Build your thinking. Sharpen your code.' })).toBeVisible();
  await expect(page.getByText('A fresh page. Your first attempt awaits.')).toBeVisible();
  await expect(page.locator('input[type=email]')).toHaveCount(0);
  await page.goto('/practice/debug-duplicate-feature-vectors');
  const editor = page.getByRole('textbox', { name: 'Code editor' }); await editor.fill('function dedupe_vectors(vectors) { return []; }');
  await page.reload(); await expect(editor).toHaveValue('function dedupe_vectors(vectors) { return []; }');
  await page.getByRole('button', { name: 'Submit attempt' }).click(); await expect(page.getByText('Wrong answer', { exact: false }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'hints' }).click(); await page.getByRole('button', { name: 'Reveal the next hint' }).click(); await expect(page.getByText('Hint 1', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your question and reasoning' }).fill('Can you explain this loop boundary?'); await page.getByRole('button', { name: 'Ask PrepVista' }).click(); await expect(page.locator('main [role=alert]')).toContainText('not configured');
  for (const route of ['/learn', '/diagnostic', '/debug', '/projects', '/incidents', '/interview', '/progress', '/settings']) { await page.goto(route); await expect(page.locator('main h1')).toBeVisible(); }
  expect(errors).toEqual([]);
});
test('all authored JavaScript reference solutions pass real sandbox checks', async ({ page }) => {
  for (const challenge of challenges) {
    await page.goto(`/practice/${challenge.challengeId}`);
    await page.getByRole('textbox', { name: 'Code editor' }).fill(challenge.solutionMetadata.referenceSolution.javascript!);
    await page.getByRole('button', { name: 'Submit attempt' }).click();
    await expect(page.getByText('Accepted for this practice set', { exact: false }), challenge.title).toBeVisible({ timeout: 20000 });
  }
});
test('sandbox contains infinite loops and denies host access', async ({ page }) => {
  await page.goto('/practice/count-word-frequencies'); const editor = page.getByRole('textbox', { name: 'Code editor' });
  await editor.fill('function word_frequencies(text) { while(true) {} }'); await page.getByRole('button', { name: 'Run examples' }).click(); await expect(page.getByText('Timeout', { exact: false }).first()).toBeVisible({ timeout: 18000 });
  await editor.fill('function word_frequencies(text) { return fetch("https://example.com"); }'); await page.getByRole('button', { name: 'Run examples' }).click(); await expect(page.getByText('Runtime error', { exact: false }).first()).toBeVisible();
  await editor.fill('function word_frequencies(text) { return process.env; }'); await page.getByRole('button', { name: 'Run examples' }).click(); await expect(page.getByText('Runtime error', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run examples' })).toBeEnabled();
});
test('mobile navigation, code workspace and saved reasoning', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('link', { name: 'Coding practice', exact: true }).click();
  await expect(page.locator('main h1')).toContainText('One problem'); await page.goto('/practice/count-word-frequencies');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'approach' }).click(); await page.getByRole('textbox', { name: 'Think before you code' }).fill('Count each normalized token in a map.'); await page.reload(); await page.getByRole('tab', { name: 'approach' }).click(); await expect(page.getByRole('textbox', { name: 'Think before you code' })).toHaveValue('Count each normalized token in a map.');
});
test('corrupt storage recovers and static review provides a finding', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('codeforge.workspace.v1', '{broken'));
  await page.goto('/debug'); await expect(page.getByText('Saved data could not be read.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Code editor' }).fill('function parse(value) { try { return JSON.parse(value); } catch (error) {} }');
  await page.getByRole('button', { name: 'Run static review' }).click(); await expect(page.getByRole('heading', {name: 'Exception handler discards the error without acting on it'}).first()).toBeVisible();
});
