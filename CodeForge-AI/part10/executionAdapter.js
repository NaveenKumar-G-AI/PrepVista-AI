/**
 * ExecutionEngineAdapter — the seam between this project engine and your
 * EXISTING secure execution/sandbox infrastructure (Phase 13, 58, 59).
 *
 * This file does NOT implement real code execution. It defines the
 * contract only, plus a non-secure in-memory mock used purely so the rest
 * of this package is testable in isolation, offline, in this sandbox.
 *
 * WIRE `runTests` / `runSecurityChecks` TO YOUR REAL SANDBOX before any of
 * this touches actual student code. Do not run student code on the
 * application host, and do not use mockRunTests for anything but tests of
 * this package.
 *
 * @typedef {import('../types').TestRunResult} TestRunResult
 * @typedef {import('../types').ProjectDefinition} ProjectDefinition
 */

/**
 * @callback RunTests
 * @param {{ files?: Record<string,string>, testResultsClaimed?: string[] }} submission
 * @param {ProjectDefinition} project
 * @returns {Promise<TestRunResult>}
 */

/**
 * @callback RunSecurityChecks
 * @param {{ files?: Record<string,string> }} submission
 * @param {ProjectDefinition} project
 * @returns {Promise<{ securityFindings: import('../types').SecurityFinding[] }>}
 */

/**
 * MOCK — deterministic, dependency-free, FOR LOCAL/TEST USE ONLY.
 *
 * Does not execute the submission's code at all. It checks which
 * acceptance-criteria IDs the caller *claims* were met
 * (submission.testResultsClaimed) against the project's declared
 * criteria — a stand-in for what a real adapter would instead derive by
 * actually compiling/running the submission against real test files.
 *
 * @type {RunTests}
 */
export async function mockRunTests(submission, project) {
  const visible = project.acceptanceCriteria.filter((c) => c.testType === 'visible');
  const hidden = project.acceptanceCriteria.filter((c) => c.testType === 'hidden');
  const claimedPassed = new Set(submission.testResultsClaimed ?? []);

  const failures = [];
  let visiblePassed = 0;
  let hiddenPassed = 0;

  for (const c of visible) {
    if (claimedPassed.has(c.id)) visiblePassed++;
    else failures.push({ id: c.id, message: `Visible criterion not met: ${c.description}` });
  }
  for (const c of hidden) {
    if (claimedPassed.has(c.id)) hiddenPassed++;
    else failures.push({ id: c.id, message: `Hidden criterion not met: ${c.description}` });
  }

  return { visiblePassed, visibleTotal: visible.length, hiddenPassed, hiddenTotal: hidden.length, failures };
}

/** @type {RunSecurityChecks} */
export async function mockRunSecurityChecks(_submission, _project) {
  return { securityFindings: [] };
}
