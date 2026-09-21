/* eslint-disable no-console */
import app from '../api/server';

async function main() {
  const server = app.listen(0); // random free port, avoids collisions entirely
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 8787;
  const base = `http://127.0.0.1:${port}`;

  const asJson = async (res: Response) => {
    const body = await res.json();
    if (!res.ok) throw new Error(`request failed (${res.status}): ${JSON.stringify(body)}`);
    return body;
  };
  const headers = (userId: string) => ({ 'Content-Type': 'application/json', 'x-user-id': userId });

  try {
    console.log('--- health ---');
    console.log(await fetch(`${base}/health`).then(asJson));

    console.log('--- create review (complexity regression) ---');
    const createRes = await fetch(`${base}/api/reviews`, {
      method: 'POST',
      headers: headers('student-1'),
      body: JSON.stringify({
        baseFiles: [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){}return 0;}' }],
        targetFiles: [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }],
        problemContext: { id: 'p1', title: 'demo', constraints: { maxInputSize: 100000 } },
      }),
    }).then(asJson) as any;
    const reviewId = createRes.review.id;
    const findingId = createRes.review.findings[0].id;
    console.log('finding:', createRes.review.findings[0].category, createRes.review.findings[0].severity, createRes.review.findings[0].priority);
    console.log('decision:', createRes.review.decision.decision);
    console.log('snippet is clean:', !JSON.stringify(createRes.review.findings).includes('No newline'));

    console.log('--- developer responds FIXED ---');
    const respondRes = await fetch(`${base}/api/reviews/${reviewId}/findings/${findingId}/respond`, {
      method: 'POST',
      headers: headers('student-1'),
      body: JSON.stringify({
        responseType: 'FIXED',
        content: 'You are right this makes it O(n^2) since n can reach 100000. I replaced the inner loop with the hash-map lookup used elsewhere.',
      }),
    }).then(asJson) as any;
    console.log('assessment:', respondRes.assessment);
    console.log('finding status now:', respondRes.finding.status);

    console.log('--- authorization checks ---');
    const wrongUser = await fetch(`${base}/api/reviews/${reviewId}`, { headers: headers('student-2') });
    const rightUser = await fetch(`${base}/api/reviews/${reviewId}`, { headers: headers('student-1') });
    const noAuth = await fetch(`${base}/api/reviews/${reviewId}`);
    console.log('student-2 reading student-1 review ->', wrongUser.status, '(expect 404, not leaked)');
    console.log('student-1 reading own review        ->', rightUser.status, '(expect 200)');
    console.log('no auth header at all                ->', noAuth.status, '(expect 401)');

    console.log('--- re-review with the fixed revision ---');
    const reReviewRes = await fetch(`${base}/api/reviews/${reviewId}/re-review`, {
      method: 'POST',
      headers: headers('student-1'),
      body: JSON.stringify({
        baseFiles: [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }],
        targetFiles: [{ path: 'sol.js', content: 'function f(nums){const seen={};for(let i=0;i<nums.length;i++){seen[nums[i]]=i;}return 0;}' }],
      }),
    }).then(asJson) as any;
    console.log('re-review outcomes:', reReviewRes.reReview.map((r: any) => r.outcome));
    console.log('new findings introduced:', reReviewRes.newFindings.length);
    console.log('final decision:', reReviewRes.decision);

    console.log('--- negative case: re-review where the fix did NOT actually happen ---');
    const create2 = await fetch(`${base}/api/reviews`, {
      method: 'POST',
      headers: headers('student-1'),
      body: JSON.stringify({
        baseFiles: [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){}return 0;}' }],
        targetFiles: [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }],
        problemContext: { id: 'p1', title: 'demo', constraints: { maxInputSize: 100000 } },
      }),
    }).then(asJson) as any;
    const review2Id = create2.review.id;
    const noopReReview = await fetch(`${base}/api/reviews/${review2Id}/re-review`, {
      method: 'POST',
      headers: headers('student-1'),
      body: JSON.stringify({
        // "fix" that only adds a harmless comment — the O(n^2) nesting is untouched
        baseFiles: [{ path: 'sol.js', content: 'function f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }],
        targetFiles: [{ path: 'sol.js', content: '// still working on it\nfunction f(nums){for(let i=0;i<nums.length;i++){for(let j=0;j<nums.length;j++){}}return 0;}' }],
      }),
    }).then(asJson) as any;
    console.log('outcome when the issue was NOT actually fixed:', noopReReview.reReview.map((r: any) => r.outcome), '(must not be RESOLVED)');

    console.log('\nALL LIVE CHECKS COMPLETED');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('INTEGRATION CHECK FAILED:', err);
  process.exit(1);
});
