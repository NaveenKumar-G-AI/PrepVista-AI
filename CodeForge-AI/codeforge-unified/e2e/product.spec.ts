import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { freshState } from '../src/lib/state';
test('diagnostic, project, interview and incident actions persist', async ({ page }) => {
  await page.goto('/diagnostic');
  await page.getByRole('radio', { name: 'O(n^2)', exact: true }).check(); await page.getByRole('button', { name: 'Check answer', exact: true }).click(); await expect(page.getByText('Correct for this question.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('Correct for this question.', { exact: true })).toBeVisible();
  await page.goto('/projects'); await page.getByRole('checkbox').first().check(); await page.getByRole('textbox', { name: 'Architecture and decisions' }).fill('Use an idempotency key and durable retry queue.'); await page.reload(); await expect(page.getByRole('checkbox').first()).toBeChecked(); await expect(page.getByRole('textbox', { name: 'Architecture and decisions' })).toHaveValue('Use an idempotency key and durable retry queue.');
  await page.goto('/interview'); await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Preserve the order of the first unique vector.'); await page.getByRole('button', { name: 'Next stage', exact: true }).click(); await page.getByRole('button', { name: 'Previous', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue('Preserve the order of the first unique vector.');
  await page.goto('/incidents'); await page.getByRole('button', { name: /INSPECT LOGS/ }).click(); await expect(page.getByText('Log search results returned.', { exact: true })).toBeVisible(); await page.reload(); await expect(page.getByText('Log search results returned.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /VERIFY SERVICE/ }).click(); await expect(page.getByText('Metrics are still degraded', { exact: false })).toBeVisible();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: /DEPLOY FIX/ }).click(); await page.getByRole('button', { name: /VERIFY SERVICE/ }).click(); await expect(page.locator('.incident-status')).toContainText('RESOLVED');
});
test('reset confirmation and bookmark toggles', async ({ page }) => {
  await page.goto('/practice'); const bookmark = page.getByRole('button', { name: 'Bookmark Fix: Deduplicating Feature Vectors', exact: true }); await bookmark.click(); await page.getByRole('combobox', { name: 'Filter challenges' }).selectOption('bookmarks'); await expect(page.locator('.challenge-card')).toHaveCount(1);
  await page.goto('/practice/count-word-frequencies'); const editor = page.getByRole('textbox', { name: 'Code editor' }); await editor.fill('function word_frequencies(text) { return {}; }');
  page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: 'Reset code', exact: true }).click(); await expect(editor).toHaveValue('function word_frequencies(text) { return {}; }');
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Reset code', exact: true }).click(); await expect(editor).toContainText(''); await expect(editor).not.toHaveValue('function word_frequencies(text) { return {}; }');
});
test('all screens fit desktop, tablet and mobile; save review images', async ({ page }) => {
  await mkdir('docs/screenshots', { recursive: true });
  const failures: string[] = []; page.on('pageerror', e => failures.push(e.message));
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ['/', '/practice/count-word-frequencies', '/learn', '/diagnostic', '/projects', '/incidents', '/interview', '/progress', '/settings']) {
      await page.goto(route); await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBe(true);
      if (route === '/' || route === '/practice/count-word-frequencies') await page.screenshot({ path: `docs/screenshots/${route === '/' ? 'workspace' : 'coding'}-${width}.png`, fullPage: true });
    }
  }
  expect(failures).toEqual([]);
});
test('export, validated restore and workspace reset', async ({ page }) => {
  await page.goto('/settings');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export workspace' }).click(); expect((await download).suggestedFilename()).toMatch(/^coding-backup-.*\.json$/);
  const input = page.locator('input[type=file]');
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByText('That file is not a valid PrepVista coding backup.', { exact: false })).toBeVisible();
  const state = freshState(); state.notes.project = 'Restored architecture notes.';
  page.once('dialog', d => d.accept()); await input.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) }); await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible();
  await page.goto('/projects'); await expect(page.getByRole('textbox', { name: 'Architecture and decisions' })).toHaveValue('Restored architecture notes.');
  await page.goto('/settings'); page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Reset workspace' }).click(); await page.goto('/projects'); await expect(page.getByRole('textbox', { name: 'Architecture and decisions' })).toHaveValue('');
});
