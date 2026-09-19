import { test, expect, type Page } from '@playwright/test';
import { challenges } from '../src/modules/coding/lib/challenges';
const owner = '11111111-1111-4111-8111-111111111111';
const artifactId = '22222222-2222-4222-8222-222222222222';
const missionId = '33333333-3333-4333-8333-333333333333';
const user = { id: owner, email: 'student@example.invalid', full_name: 'Student', plan: 'free', active_plan: 'free', highest_owned_plan: 'free', effective_plan: 'free', owned_plans: ['free'], expired_plans: [], is_admin: false, is_org_admin: false, org_student: false, onboarding_completed: true, usage: { plan: 'free', used: 0, limit: 2, remaining: 2 } };
const blank = () => ({ version: 1, drafts: {} as Record<string, string>, notes: {} as Record<string, string>, language: 'javascript', role: 'GENERAL_SWE', bookmarks: [], learned: [], hints: {}, assisted: [], attempts: [], projectSteps: [], incidentActions: [] });
async function prepare(page: Page) {
  const server = { revision: 0, state: blank(), writes: 0, commits: 0, conflict: false, loadFailures: 0, artifact: null as Record<string, unknown> | null };
  await page.addInitScript(() => sessionStorage.setItem('pv_access_token', 'test.payload.signature'));
  await page.route('**/api/awake', route => route.fulfill({ json: { status: 'awake' } }));
  await page.route('https://**/*', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/auth/me') return route.fulfill({ json: user });
    if (path === '/coding/access') return route.fulfill({ json: { schema_version: 1, student_profile_id: owner, enabled: true, execution_language: 'javascript', result_authority: 'CLIENT_REPORTED', persistence: 'SERVER', server_sync: true, ai_mentoring: false, readiness_updates: true, guest_import: true, interview_credits_consumed: 0 } });
    if (path === '/coding/workspace') {
      if (request.method() === 'GET' && server.loadFailures > 0) {
        server.loadFailures--;
        return route.fulfill({ status: 503, json: { detail: 'Temporary workspace outage.' } });
      }
      if (request.method() === 'PUT') {
        server.writes++;
        const value = request.postDataJSON(); expect(value.expected_owner_id).toBe(owner);
        if (server.conflict || value.revision !== server.revision) return route.fulfill({ status: 409, json: { detail: 'Newer server copy exists.' } });
        server.state = value.state; server.revision++;
      }
      return route.fulfill({ json: { revision: server.revision, state: server.state } });
    }
    if (path === '/coding/artifacts' && request.method() === 'POST') {
      const content = request.postDataJSON(); expect(content.expected_owner_id).toBe(owner);
      server.artifact = { id: artifactId, content, created_at: '2026-09-12T00:00:00Z', authority: 'CLIENT_REPORTED' };
      return route.fulfill({ json: server.artifact });
    }
    if (path === '/coding/artifacts') return route.fulfill({ json: [] });
    if (path === `/coding/artifacts/${artifactId}`) return route.fulfill({ json: server.artifact });
    if (path === '/coding/imports/preview') return route.fulfill({ json: { id: artifactId, report: { added: 1, conflicts: 0, duplicate_attempts: 0 }, policy: 'Original guest data is preserved.' } });
    if (path === `/coding/imports/${artifactId}/commit`) { server.commits++; return route.fulfill({ json: { revision: ++server.revision, state: server.state } }); }
    if (path === '/journey/sharing') return route.fulfill({ json: [] });
    if (path === '/journey/current') return route.fulfill({ json: { id: artifactId, role_label: 'Software engineer', overall_state: 'MORE_EVIDENCE_NEEDED', data_health: 'CURRENT', as_of: '2026-09-12', policy_version: 'practice-evidence-v1', note: 'Practice evidence only.', next_mission: { id: missionId, title: 'Choose a coding problem', reason: 'Save an implementation and explanation.', href: '/coding', estimated_minutes: 15 }, rows: [{ key: 'correctness', label: 'Programming and correctness', state: 'NOT_MEASURED', confidence: 'none', freshness: 'CURRENT', coverage: 0, gap: 'Gather relevant evidence.', next_action: '/coding', sources: [] }] } });
    if (path === `/journey/missions/${missionId}/launch`) return route.fulfill({ json: { href: `/coding?mission_id=${missionId}`, status: 'LAUNCHED' } });
    return route.fulfill({ status: 503, json: { detail: 'Test service unavailable' } });
  });
  return server;
}

test('server drafts resume and immutable code is handed into interview setup', async ({ page }) => {
  const server = await prepare(page);
  const challenge = challenges[0];
  await page.goto(`/coding/practice/${challenge.challengeId}`);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await editor.fill('function savedImplementation() { return 42; }');
  await page.getByRole('textbox', { name: 'Your explanation' }).fill('I tested the empty input and documented the trade-off.');
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect.poll(() => server.state.drafts[`${challenge.challengeId}:javascript`]).toContain('savedImplementation');
  await page.reload();
  await expect(editor).toHaveValue(/savedImplementation/);
  await page.getByRole('button', { name: 'Save for interview' }).click();
  await page.getByRole('link', { name: 'Explain this artifact in an interview' }).click();
  await expect(page.getByRole('heading', { name: 'Coding artifact for this interview' })).toBeVisible();
  await page.getByText('Preview saved code').click();
  await expect(page.getByText('function savedImplementation() { return 42; }', { exact: true })).toBeVisible();
  const requests: string[] = [];
  await page.route('**/interviews/setup', route => { requests.push(route.request().postData() || ''); return route.fulfill({ status: 422, json: { detail: 'Fixture ends before creating an interview.' } }); });
  await page.locator('input[type="file"]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nfixture') });
  await page.getByRole('button', { name: 'Start Interview', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toContain('name="coding_artifact_id"'); expect(requests[0]).toContain(artifactId);
  expect(requests[0]).toContain('name="expected_owner_id"'); expect(requests[0]).toContain(owner);
});

test('revision conflict preserves edits and requires an explicit server-copy decision', async ({ page }) => {
  const server = await prepare(page); server.conflict = true;
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await editor.fill('my unsynced code');
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Another device has newer work' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download workspace', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('prepvista-coding-workspace.json');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Load server copy', exact: true }).click();
  await expect(editor).toHaveValue('my unsynced code');
});

test('failed initial load retries with unsynced edits and preserves their conflict revision across refresh', async ({ page }) => {
  const server = await prepare(page);
  const draftId = `${challenges[0].challengeId}:javascript`;
  const key = `pv_coding_workspace_v1:${owner}`;
  server.revision = 2; server.state.drafts[draftId] = 'newer server code'; server.loadFailures = 1;
  await page.addInitScript(({ key, state }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify({ revision: 1, dirty: true, state }));
  }, { key, state: { ...blank(), drafts: { [draftId]: 'unsynced local code' } } });
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  await expect(page.getByText('Could not load server work.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry sync', exact: true })).toBeDisabled();
  // Let the real autosave interval run while the initial load remains blocked.
  await page.waitForTimeout(5100);
  expect(server.writes).toBe(0);
  await page.getByRole('button', { name: 'Retry workspace load', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your JavaScript solution' })).toHaveValue('unsynced local code');
  await expect(page.getByText('Another device has newer work.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  expect(server.writes).toBe(0);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).revision, key)).toBe(1);
  // Keep both versions after a real navigation without dismissing the conflict.
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Your JavaScript solution' })).toHaveValue('unsynced local code');
  await expect(page.getByText('Another device has newer work.', { exact: false })).toBeVisible();
  expect(server.state.drafts[draftId]).toBe('newer server code');
  expect(server.writes).toBe(0);
});

test('retrying a failed load syncs recovered edits when the server revision still matches', async ({ page }) => {
  const server = await prepare(page);
  const draftId = `${challenges[0].challengeId}:javascript`;
  server.revision = 3; server.loadFailures = 1;
  await page.addInitScript(({ key, state }) => {
    sessionStorage.setItem(key, JSON.stringify({ revision: 3, dirty: true, state }));
  }, { key: `pv_coding_workspace_v1:${owner}`, state: { ...blank(), drafts: { [draftId]: 'recovered matching revision' } } });
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  await expect(page.getByText('Could not load server work.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry workspace load', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your JavaScript solution' })).toHaveValue('recovered matching revision');
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect.poll(() => server.state.drafts[draftId]).toBe('recovered matching revision');
  expect(server.revision).toBe(4);
  expect(server.writes).toBe(1);
});

test('explicit server replacement refreshes recovery storage so discarded edits do not return', async ({ page }) => {
  const server = await prepare(page);
  const draftId = `${challenges[0].challengeId}:javascript`;
  server.state.drafts[draftId] = 'saved server copy'; server.conflict = true;
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await editor.fill('local copy to replace');
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect(page.getByText('Another device has newer work.', { exact: false })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Load server copy', exact: true }).click();
  await expect(editor).toHaveValue('saved server copy');
  const cached = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), `pv_coding_workspace_v1:${owner}`);
  expect(cached.dirty).toBe(false);
  expect(cached.state.drafts[draftId]).toBe('saved server copy');
  await page.reload();
  await expect(editor).toHaveValue('saved server copy');
});

test('failed explicit replacement keeps the local backup and a normal retry recovers it', async ({ page }) => {
  const server = await prepare(page);
  const draftId = `${challenges[0].challengeId}:javascript`;
  server.state.drafts[draftId] = 'saved server copy'; server.conflict = true;
  await page.goto(`/coding/practice/${challenges[0].challengeId}`);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await editor.fill('local copy remains recoverable');
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect(page.getByText('Another device has newer work.', { exact: false })).toBeVisible();
  server.loadFailures = 1;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Load server copy', exact: true }).click();
  await expect(page.getByText('Could not load server work.', { exact: false })).toBeVisible();
  const cached = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), `pv_coding_workspace_v1:${owner}`);
  expect(cached.dirty).toBe(true);
  expect(cached.state.drafts[draftId]).toBe('local copy remains recoverable');
  // Exports stay available while editing and sync are blocked by the failed load.
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download workspace', exact: true }).click();
  const download = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.drafts[draftId]).toBe('local copy remains recoverable');
  await page.getByRole('button', { name: 'Retry workspace load', exact: true }).click();
  await expect(editor).toHaveValue('local copy remains recoverable');
  expect(server.state.drafts[draftId]).toBe('saved server copy');
});

test('student explicitly shares one artifact, retries a lost receipt and withdraws reviewer access', async ({ page }) => {
  const server = await prepare(page);
  const reviewer = '44444444-4444-4444-8444-444444444444';
  server.artifact = { id: artifactId, created_at: '2026-09-19T00:00:00Z', authority: 'CLIENT_REPORTED', content: {
    challenge_id: 'review-fixture', language: 'javascript', code: 'function privateSavedCode() {}', explanation: 'My saved reasoning.', assistance: 'UNKNOWN', passed: null, total: null } };
  let failReceipt = true, status = 'OPEN', firstRequest: string | undefined;
  await page.route('**/artifact-reviews/options', route => route.fulfill({ json: { enabled: true, reviewers: [{ id: reviewer, name: 'Selected reviewer' }], consent_version: 'artifact-feedback-v1' } }));
  await page.route('**/artifact-reviews', route => {
    const data = route.request().postDataJSON();
    expect(data).toMatchObject({ expected_owner_id: owner, artifact_id: artifactId, reviewer_id: reviewer, share_saved_artifact: true, consent_version: 'artifact-feedback-v1' });
    if (!firstRequest) firstRequest = data.request_id;
    expect(data.request_id).toBe(firstRequest);
    if (failReceipt) { failReceipt = false; return route.abort('failed'); }
    return route.fulfill({ status: 201, json: { id: missionId, status } });
  });
  await page.route('**/artifact-reviews/mine', route => route.fulfill({ json: { items: [{ id: missionId, artifact_id: artifactId, status, feedback: null }], next_cursor: null } }));
  await page.route(`**/artifact-reviews/${missionId}/withdraw`, route => {
    expect(route.request().postDataJSON()).toEqual({ expected_owner_id: owner }); status = 'WITHDRAWN';
    return route.fulfill({ json: { status } });
  });
  await page.goto(`/coding/artifacts/${artifactId}`);
  await expect(page.getByRole('button', { name: 'Request artifact feedback' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Reviewer', exact: true }).selectOption(reviewer);
  await expect(page.getByRole('button', { name: 'Request artifact feedback' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I agree to share this saved artifact', exact: false }).check();
  await page.getByRole('button', { name: 'Request artifact feedback' }).click();
  await expect(page.getByText('The request could not be confirmed.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Request artifact feedback' }).click();
  await expect(page.getByText('Review requested.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'My artifact reviews', exact: true }).click();
  await page.getByRole('button', { name: 'Withdraw reviewer access' }).click();
  await expect(page.getByText('Review status: WITHDRAWN', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw reviewer access' })).toHaveCount(0);
});

test('assigned reviewer submits advisory feedback and unsupported capabilities remain not assessed', async ({ page }) => {
  await prepare(page);
  const reviewer = '44444444-4444-4444-8444-444444444444';
  await page.route('**/auth/me', route => route.fulfill({ json: { ...user, id: reviewer } }));
  await page.route('**/artifact-reviews/mine', route => route.fulfill({ json: { items: [], next_cursor: null } }));
  await page.route('**/artifact-reviews/inbox', route => route.fulfill({ json: { items: [{ id: missionId, status: 'OPEN' }], next_cursor: null } }));
  await page.route(`**/artifact-reviews/${missionId}/artifact`, route => route.fulfill({ json: { id: missionId, status: 'OPEN', artifact: {
    code: 'private reviewed fixture', explanation: 'Bounded explanation', language: 'javascript', challenge_id: 'review-fixture', assistance: 'UNKNOWN' } } }));
  let writes = 0;
  await page.route(`**/artifact-reviews/${missionId}/feedback`, route => {
    const body = route.request().postDataJSON();
    expect(body.expected_owner_id).toBe(reviewer); expect(body.rubric_version).toBe('artifact-feedback-v1');
    expect(body.observations.communication).toBe('OBSERVED_STRENGTH');
    expect(body.observations.correctness).toBe('NOT_ASSESSED');
    writes++; return route.fulfill({ json: { status: 'REVIEWED', assessment_qualified: false } });
  });
  await page.goto('/readiness/reviews');
  await page.getByRole('button', { name: 'Load reviewer inbox' }).click();
  await page.getByRole('button', { name: 'Open open review', exact: false }).click();
  await expect(page.getByText('private reviewed fixture', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'communication', exact: true }).selectOption('OBSERVED_STRENGTH');
  await page.getByRole('textbox', { name: 'Advisory feedback' }).fill('The explanation identifies a concrete trade-off.');
  await page.getByRole('button', { name: 'Save advisory feedback' }).click();
  await expect(page.getByText('Advisory feedback saved. No readiness score was changed.', { exact: true })).toBeVisible();
  await expect(page.getByText('private reviewed fixture', { exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
});

test('guest import requires item selection, preview and ownership confirmation', async ({ page }) => {
  const server = await prepare(page);
  await page.goto('/coding/settings');
  const incoming = { ...blank(), drafts: { 'guest:javascript': 'my guest code' } };
  await page.locator('input[type="file"]').setInputFiles({ name: 'guest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await expect(page.getByRole('button', { name: 'Preview selected items' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Draft: guest:javascript' }).check();
  await page.getByRole('button', { name: 'Preview selected items' }).click();
  await expect(page.getByRole('button', { name: 'Confirm import', exact: true })).toBeDisabled();
  expect(server.commits).toBe(0);
  await page.getByRole('checkbox', { name: 'I selected my own work', exact: false }).check();
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
  await expect.poll(() => server.commits).toBe(1);
});

test('one readiness mission launches into coding and unsupported execution stays unavailable', async ({ page }) => {
  await prepare(page);
  await page.goto('/readiness');
  await expect(page.getByRole('heading', { name: 'Your readiness list', exact: true })).toBeVisible();
  await expect(page.getByText('not measured · current', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`mission_id=${missionId}`));
  await page.getByRole('link', { name: challenges[0].title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`mission_id=${missionId}`));
  await page.getByRole('combobox', { name: 'Solution language' }).selectOption('python');
  await expect(page.getByRole('textbox', { name: 'Your python solution' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Run practice checks' })).toBeDisabled();
  await expect(page.getByText('Editing and explanation; execution unavailable', { exact: false })).toBeVisible();
});

test('repair and explanation missions retain the selected implementation and save a new revision', async ({ page }) => {
  const server = await prepare(page);
  const challenge = challenges[0];
  server.state.drafts[`${challenge.challengeId}:javascript`] = 'unrelated practice draft';
  server.artifact = { id: artifactId, created_at: '2026-09-12T00:00:00Z', authority: 'CLIENT_REPORTED', content: { challenge_id: challenge.challengeId, challenge_version: challenge.version, language: 'javascript', code: 'function selectedArtifact() { return 0; }', explanation: '', assistance: 'KNOWN_ASSISTED', passed: 0, total: 1 } };
  await page.goto(`/coding/debug?artifact_id=${artifactId}&mission_id=${missionId}`);
  const editor = page.getByRole('textbox', { name: 'Your JavaScript solution' });
  await expect(editor).toHaveValue('function selectedArtifact() { return 0; }');
  await editor.fill('function selectedArtifact() { return 1; }');
  await page.getByRole('textbox', { name: 'Your explanation' }).fill('I reproduced the failing input and corrected the return value. Tests still need to run.');
  await page.getByRole('button', { name: 'Save for interview' }).click();
  await expect(page.getByRole('link', { name: 'Explain this artifact in an interview' })).toBeVisible();
  const content = server.artifact!.content as Record<string, unknown>;
  expect(content.parent_artifact_id).toBe(artifactId); expect(content.mission_id).toBe(missionId);
  expect(content.passed).toBeNull(); expect(content.assistance).toBe('KNOWN_ASSISTED');
  expect(server.state.drafts[`${challenge.challengeId}:javascript`]).toBe('unrelated practice draft');
  await page.goto(`/coding/explain?artifact_id=${artifactId}`);
  await expect(page.getByRole('heading', { name: 'Explain your saved implementation', exact: true })).toBeVisible();
  await expect(editor).toHaveValue('function selectedArtifact() { return 1; }');
});

test('saved readiness remains readable after feature rollback without launching historical missions', async ({ page }) => {
  await prepare(page);
  await page.route('**/coding/access', route => route.fulfill({ json: { schema_version: 1, student_profile_id: owner, enabled: false, execution_language: 'javascript', result_authority: 'CLIENT_REPORTED', persistence: 'BROWSER_TAB', server_sync: false, ai_mentoring: false, readiness_updates: false, interview_credits_consumed: 0 } }));
  await page.route(`**/journey/snapshots/${artifactId}`, route => route.fulfill({ json: { id: artifactId, role_label: 'Software engineer', overall_state: 'MORE_EVIDENCE_NEEDED', data_health: 'CURRENT', as_of: '2026-09-12', policy_version: 'practice-evidence-v1', note: 'Saved practice evidence.', next_mission: { id: 'historical-recommendation', title: 'An old recommendation', href: '/coding' }, rows: [] } }));
  await page.goto(`/readiness/snapshots/${artifactId}`);
  await expect(page.getByText('This is a saved snapshot.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print this snapshot' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
  let failExport = true;
  await page.route(`**/journey/snapshots/${artifactId}/export?format=*`, route => {
    if (failExport) return route.fulfill({ status: 503, json: { detail: 'Unavailable' } });
    const format = new URL(route.request().url()).searchParams.get('format');
    return route.fulfill({ json: { filename: `prepvista-readiness-${artifactId}.${format}`, media_type: format === 'json' ? 'application/json' : 'text/html', content: format === 'json' ? JSON.stringify({ snapshot_id: artifactId }) : '<!doctype html><title>Saved private report</title>' } });
  });
  await page.getByRole('button', { name: 'Download report JSON' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The saved report could not be downloaded' })).toContainText('Your snapshot is preserved');
  failExport = false;
  for (const [name, extension] of [['Download report JSON', 'json'], ['Download printable report', 'html']]) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`prepvista-readiness-${artifactId}.${extension}`);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toContain(extension === 'json' ? artifactId : 'Saved private report');
  }
});

test('sharing revocation recovers from failed loads and refreshes while coding is paused', async ({ page }) => {
  await prepare(page);
  await page.route('**/coding/access', route => route.fulfill({ status: 503, json: { detail: 'Coding paused' } }));
  let enabled = true, failRead = true, writes = 0;
  await page.route('**/journey/sharing', route => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toEqual({ expected_owner_id: owner, organization_id: artifactId, enabled: false });
      writes++; enabled = false; failRead = true;
      return route.fulfill({ json: { enabled: false } });
    }
    if (failRead) return route.fulfill({ status: 503, json: { detail: 'Sharing check unavailable' } });
    return route.fulfill({ json: [{ id: artifactId, name: 'Former organization', enabled, can_share: false }] });
  });
  await page.goto('/readiness');
  await expect(page.getByRole('alert').filter({ hasText: 'Sharing preferences could not be checked' })).toBeVisible();
  await expect(page.getByText('No organization sharing options are available for your account.')).toHaveCount(0);
  failRead = false;
  await page.getByRole('button', { name: 'Retry sharing preferences' }).click();
  await expect(page.getByRole('button', { name: 'Revoke sharing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Revoke sharing', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sharing preferences could not be checked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke sharing', exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  failRead = false;
  await page.getByRole('button', { name: 'Retry sharing preferences' }).click();
  await expect(page.getByText('Former organization · Private', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share aggregate summary' })).toBeDisabled();
});

test('lost sharing save response rechecks committed state without replaying a stale toggle', async ({ page }) => {
  await prepare(page);
  let enabled = false, writes = 0;
  await page.route('**/journey/sharing', route => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toEqual({ expected_owner_id: owner, organization_id: artifactId, enabled: true });
      enabled = true; writes++;
      return route.abort('failed'); // The server committed but its receipt was lost.
    }
    return route.fulfill({ json: [{ id: artifactId, name: 'Current organization', enabled, can_share: true }] });
  });
  await page.goto('/readiness');
  await page.getByRole('button', { name: 'Share aggregate summary' }).click();
  await expect(page.getByText('The save response could not be confirmed.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke sharing', exact: true })).toBeEnabled();
  await expect(page.getByText('Current organization · Sharing enabled', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test('malformed sharing preferences cannot render consent actions or a false empty state', async ({ page }) => {
  await prepare(page);
  let valid = false;
  await page.route('**/journey/sharing', route => route.fulfill({ json: valid ? [] : [
    { id: artifactId, name: 'Invalid preference', enabled: 'false', can_share: true },
  ] }));
  await page.goto('/readiness');
  await expect(page.getByRole('alert').filter({ hasText: 'Sharing preferences could not be checked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share aggregate summary' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Revoke sharing', exact: true })).toHaveCount(0);
  await expect(page.getByText('No organization sharing options are available for your account.')).toHaveCount(0);
  valid = true;
  await page.getByRole('button', { name: 'Retry sharing preferences' }).click();
  await expect(page.getByText('No organization sharing options are available for your account.')).toBeVisible();
});

test('saved snapshot history works with coding paused and paginates older role policies', async ({ page }) => {
  await prepare(page);
  await page.route('**/coding/access', route => route.fulfill({ status: 503, json: { detail: 'Practice paused' } }));
  await page.route('**/journey/snapshots*', route => {
    const older = new URL(route.request().url()).searchParams.has('before');
    return route.fulfill({ json: { items: [{ id: older ? missionId : artifactId, role_label: older ? 'Backend engineer' : 'Software engineer', policy_version: 'practice-evidence-v1', as_of: older ? '2026-09-11' : '2026-09-12', overall_state: 'MORE_EVIDENCE_NEEDED' }], next_cursor: older ? null : artifactId } });
  });
  await page.goto('/readiness/history');
  await expect(page.getByRole('link', { name: 'Software engineer · 2026-09-12' })).toHaveAttribute('href', `/readiness/snapshots/${artifactId}`);
  await page.getByRole('button', { name: 'Older snapshots' }).click();
  await expect(page.getByRole('link', { name: 'Backend engineer · 2026-09-11' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Older snapshots' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Newest snapshots' }).click();
  await expect(page.getByRole('link', { name: 'Software engineer · 2026-09-12' })).toBeVisible();
});

test('student accepts assignment sharing, saves assigned project and can withdraw after pause', async ({ page }) => {
  const server = await prepare(page);
  const item = { id: artifactId, title: 'Notification repair', instructions: 'Build the project and explain duplicate delivery checks.', organization_name: 'Test college', task_kind: 'PROJECT', status: 'ASSIGNED', due_date: null, accepted_at: null as string | null, withdrawn_at: null as string | null, mission_id: null as string | null, mission_status: 'OPEN', active_membership: true };
  let enabled = true;
  await page.route('**/journey/assignments/mine', route => route.fulfill({ json: { items: [item], next_cursor: null, enabled } }));
  await page.route(`**/journey/assignments/${artifactId}/accept`, route => {
    expect(route.request().postDataJSON()).toEqual({ expected_owner_id: owner, share_completion: true });
    item.accepted_at = '2026-09-13T00:00:00Z'; item.mission_id = missionId; item.status = 'ACKNOWLEDGED';
    return route.fulfill({ json: { mission_id: missionId } });
  });
  await page.route(`**/journey/missions/${missionId}/launch`, route => route.fulfill({ json: { href: `/coding/projects?mission_id=${missionId}`, status: 'LAUNCHED' } }));
  await page.route(`**/journey/missions/${missionId}`, route => route.fulfill({ json: { id: missionId, title: item.title, reason: item.instructions, origin: 'ORGANIZATION_ASSIGNMENT', status: 'LAUNCHED', completion: 'ARTIFACT_SAVED' } }));
  await page.route(`**/journey/assignments/${artifactId}/withdraw`, route => { item.withdrawn_at = '2026-09-13T01:00:00Z'; item.status = 'CANCELLED'; return route.fulfill({ json: { status: 'WITHDRAWN' } }); });
  await page.goto('/readiness/assignments');
  await expect(page.getByRole('button', { name: 'Accept assignment' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Share this assignment’s completion status with Test college.' }).check();
  await page.getByRole('button', { name: 'Accept assignment' }).click();
  await page.getByRole('button', { name: 'Continue assignment' }).click();
  await expect(page.getByRole('complementary', { name: 'Current practice mission' })).toContainText('Organization assignment');
  await page.getByRole('textbox', { name: 'Code editor' }).fill('function deliverOnce(key) { return key; }');
  await page.getByRole('textbox', { name: 'Architecture and decisions' }).fill('I use a stable key and test duplicate deliveries.');
  await page.getByRole('button', { name: 'Save for interview' }).click();
  await expect(page.getByRole('link', { name: 'Explain this artifact in an interview' })).toBeVisible();
  expect((server.artifact!.content as Record<string, unknown>).mission_id).toBe(missionId);
  enabled = false;
  await page.goto('/readiness/assignments');
  await expect(page.getByText('Assignments are paused.', { exact: false })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Withdraw and stop status sharing' }).click();
  await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible();
  expect(server.artifact).not.toBeNull();
});

test('server validation queues saved code and retains results with coding paused', async ({ page }) => {
  const server = await prepare(page);
  server.artifact = { id: artifactId, created_at: '2026-09-13T00:00:00Z', authority: 'CLIENT_REPORTED',
    content: { challenge_id: 'search-insert-position', challenge_version: 1, language: 'javascript', code: 'function search_insert_position(){return 0}', explanation: '', assistance: 'UNKNOWN', passed: null, total: null } };
  await page.route('**/coding/access', route => route.fulfill({ json: { schema_version: 1, student_profile_id: owner, enabled: true, execution_language: 'javascript', result_authority: 'CLIENT_REPORTED', persistence: 'SERVER', server_sync: true, server_validation: true, ai_mentoring: false, readiness_updates: true, interview_credits_consumed: 0 } }));
  const job = { id: missionId, artifact_id: artifactId, state: 'QUEUED', suite_id: 'search-insert-server-v1', created_at: '2026-09-13T00:00:00Z', result: null as null | Record<string, unknown> };
  let requested = false;
  await page.route(`**/coding/artifacts/${artifactId}/validations`, route => route.fulfill({ json: { supported: true, suite_id: job.suite_id, items: requested ? [job] : [] } }));
  await page.route(`**/coding/artifacts/${artifactId}/validate`, route => {
    const body = route.request().postDataJSON();
    expect(body.expected_owner_id).toBe(owner); expect(Object.keys(body).sort()).toEqual(['expected_owner_id', 'request_id']);
    requested = true;
    return route.fulfill({ status: 202, json: job });
  });
  await page.goto(`/coding/artifacts/${artifactId}`);
  await page.getByRole('button', { name: 'Validate saved code on server' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Server check queued or running' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate saved code on server' })).toBeDisabled();
  job.state = 'COMPLETED'; job.result = { authority: 'ISOLATED_SERVER_TEST', passed: 1, total: 2, checks: [{ id: 'case-0', status: 'PASSED' }, { id: 'case-1', status: 'WRONG_ANSWER' }] };
  await page.getByRole('button', { name: 'Refresh server checks', exact: true }).click();
  await expect(page.getByText('1/2 server checks passed', { exact: false })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Server validation completed: 1 of 2 checks passed.' })).toBeVisible();
  await page.route('**/coding/access', route => route.fulfill({ status: 503, json: { detail: 'Coding paused' } }));
  await page.route('**/coding/validations', route => route.fulfill({ json: { items: [job], next_cursor: null } }));
  await page.goto('/readiness/validations');
  await expect(page.getByText('1/2 server checks passed', { exact: false })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download this results page' }).click();
  expect((await pending).suggestedFilename()).toBe('prepvista-server-checks-newest.json');
  await page.route(`**/coding/validations/${missionId}`, route => route.fulfill({ json: { ...job, qualification_id: 'review-fixture-v1', code_sha256: 'a'.repeat(64), suite_sha256: 'b'.repeat(64), note: 'This result covers its saved artifact and suite only.' } }));
  await page.getByRole('link', { name: 'search-insert-server-v1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved server check', exact: true })).toBeVisible();
  await expect(page.getByText('1/2 server checks passed', { exact: false })).toBeVisible();
  await page.getByText('Evidence provenance', { exact: true }).click();
  await expect(page.getByText('Runner qualification reference: review-fixture-v1')).toBeVisible();
});

test('staff reviews selected students before creating an assignment on mobile', async ({ page }) => {
  await prepare(page);
  await page.route('**/auth/me', route => route.fulfill({ json: { ...user, is_org_admin: true } }));
  await page.route('**/org/my/dashboard', route => route.fulfill({ json: { organization: { name: 'Test college', org_code: 'TEST', seat_limit: 20, seats_used: 1 } } }));
  await page.route('**/journey/assignments/options?*', route => route.fulfill({ json: { seasons: [{ id: artifactId, name: 'Placement season' }], students: [{ id: owner, name: 'Pilot Student' }], more_students: false, task_kinds: [{ id: 'CODING_PRACTICE', title: 'Implement and explain a coding problem' }] } }));
  await page.route('**/journey/assignments/staff', route => route.fulfill({ json: { items: [], next_cursor: null } }));
  const commands: Record<string, unknown>[] = [];
  await page.route('**/journey/assignments', route => { commands.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { id: artifactId } }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/org-admin/assignments');
  await page.getByRole('combobox', { name: 'Placement season' }).selectOption(artifactId);
  await page.getByRole('textbox', { name: 'Assignment title', exact: true }).fill('Explain a coding implementation');
  await page.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Implement a problem and explain your test cases.');
  await page.getByRole('checkbox', { name: 'Pilot Student', exact: true }).check();
  await page.getByRole('button', { name: 'Review assignment', exact: true }).click();
  expect(commands).toHaveLength(0);
  await expect(page.getByRole('heading', { name: 'Review before assigning' }).locator('..').getByRole('listitem')).toHaveText('Pilot Student');
  await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Assignment created for 1 selected students.' })).toBeVisible();
  expect(commands).toHaveLength(1); expect(commands[0].expected_owner_id).toBe(owner); expect(commands[0].student_ids).toEqual([owner]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});

test('coding keyboard navigation exposes active selections and permits leaving the editor', async ({ page }) => {
  await prepare(page);
  await page.goto('/coding/learn');
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to coding workspace' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#coding-workspace-content')).toBeFocused();
  const concepts = page.getByRole('navigation', { name: 'Concepts' });
  await expect(concepts.getByRole('button', { pressed: true })).toHaveCount(1);
  const concept = concepts.getByRole('button', { pressed: false }).first();
  const conceptName = await concept.innerText();
  await concept.focus();
  await page.keyboard.press('Enter');
  await expect(concepts.getByRole('button', { pressed: true })).toHaveText(conceptName, { useInnerText: true });
  for (const path of ['/coding/diagnostic', '/coding/explain', '/coding/incidents']) {
    await page.goto(path);
    const workspace = page.locator('.coding-surface');
    await expect(workspace.getByRole('button', { pressed: true })).toHaveCount(1);
    const option = workspace.locator('button[aria-pressed="false"]').first();
    const name = await option.innerText();
    await option.focus();
    await page.keyboard.press('Space');
    await expect(workspace.getByRole('button', { pressed: true })).toHaveText(name, { useInnerText: true });
    await expect(workspace.getByRole('button', { pressed: true })).toBeFocused();
  }
  await page.goto('/coding/debug');
  const editor = page.getByRole('textbox', { name: 'Code editor', exact: true });
  await editor.fill('const preserved = 1;');
  await editor.focus();
  await page.keyboard.press('Tab');
  await expect(editor).not.toBeFocused();
  await expect(editor).toHaveValue('const preserved = 1;');
});

test('ported learning, projects, incidents and review workspaces render on a narrow screen', async ({ page }) => {
  await prepare(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/coding/learn', '/coding/diagnostic', '/coding/projects', '/coding/incidents', '/coding/debug', '/coding/explain', '/coding/history']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), path).toBe(true);
  }
  expect(errors).toEqual([]);
});
