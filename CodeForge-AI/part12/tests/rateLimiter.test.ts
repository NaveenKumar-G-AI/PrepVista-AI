import { test, run, assert } from './testHarness.js';
import { TokenBucketRateLimiter } from '../src/services/rateLimiter.js';

test('allows up to capacity requests, then blocks', () => {
  const limiter = new TokenBucketRateLimiter(3, 1000, 1);
  const now = 0;
  assert.equal(limiter.tryConsume('user:1', now), true);
  assert.equal(limiter.tryConsume('user:1', now), true);
  assert.equal(limiter.tryConsume('user:1', now), true);
  assert.equal(limiter.tryConsume('user:1', now), false, '4th request in the same instant must be blocked');
});

test('refills over time, one token per interval', () => {
  const limiter = new TokenBucketRateLimiter(2, 1000, 1);
  assert.equal(limiter.tryConsume('user:1', 0), true);
  assert.equal(limiter.tryConsume('user:1', 0), true);
  assert.equal(limiter.tryConsume('user:1', 500), false, 'no refill yet at t=500 with a 1000ms interval');
  assert.equal(limiter.tryConsume('user:1', 1000), true, 'one token refilled at t=1000');
  assert.equal(limiter.tryConsume('user:1', 1000), false, 'only one token refilled, second request still blocked');
});

test('different keys are fully independent — one user hitting the limit does not affect another', () => {
  const limiter = new TokenBucketRateLimiter(1, 1000, 1);
  assert.equal(limiter.tryConsume('user:1', 0), true);
  assert.equal(limiter.tryConsume('user:1', 0), false);
  assert.equal(limiter.tryConsume('user:2', 0), true, 'a different key must have its own independent bucket');
});

test('composite keys support per-assessment-per-user limiting without extra logic in the limiter itself', () => {
  const limiter = new TokenBucketRateLimiter(1, 1000, 1);
  assert.equal(limiter.tryConsume('assessment:A:user:1', 0), true);
  assert.equal(limiter.tryConsume('assessment:B:user:1', 0), true, 'same user, different assessment = different bucket');
  assert.equal(limiter.tryConsume('assessment:A:user:1', 0), false);
});

test('tokens never exceed capacity even after a very long idle period', () => {
  const limiter = new TokenBucketRateLimiter(3, 1000, 1);
  limiter.tryConsume('user:1', 0);
  assert.equal(limiter.remaining('user:1', 1_000_000_000), 3, 'must cap at capacity, not accumulate unbounded tokens');
});

test('rejects nonsensical construction parameters', () => {
  assert.throws(() => new TokenBucketRateLimiter(0, 1000, 1));
  assert.throws(() => new TokenBucketRateLimiter(3, 0, 1));
  assert.throws(() => new TokenBucketRateLimiter(3, 1000, 0));
});

await run('rateLimiter.test.ts');
