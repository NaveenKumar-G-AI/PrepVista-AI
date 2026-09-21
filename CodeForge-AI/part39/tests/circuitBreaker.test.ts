import { CircuitBreaker } from '../src/reliability/CircuitBreaker';
import { CircuitOpenError } from '../src/errors';

const OPTS = { failureThreshold: 3, windowMs: 60_000, cooldownMs: 50 };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('CircuitBreaker — state machine', () => {
  it('starts CLOSED', () => {
    const cb = new CircuitBreaker();
    expect(cb.state('provider:model')).toBe('CLOSED');
  });

  it('opens after failureThreshold failures within the window', () => {
    const cb = new CircuitBreaker();
    const key = 'provider:model';
    for (let i = 0; i < OPTS.failureThreshold; i++) cb.onFailure(key, OPTS);
    expect(cb.state(key)).toBe('OPEN');
  });

  it('rejects calls while OPEN and cooldown has not elapsed', () => {
    const cb = new CircuitBreaker();
    const key = 'provider:model';
    for (let i = 0; i < OPTS.failureThreshold; i++) cb.onFailure(key, OPTS);
    expect(() => cb.beforeCall(key, OPTS)).toThrow(CircuitOpenError);
  });

  it('transitions to HALF_OPEN after cooldown and allows exactly one probe through', async () => {
    const cb = new CircuitBreaker();
    const key = 'provider:model';
    for (let i = 0; i < OPTS.failureThreshold; i++) cb.onFailure(key, OPTS);

    await sleep(OPTS.cooldownMs + 10);

    expect(() => cb.beforeCall(key, OPTS)).not.toThrow(); // the one allowed probe
    expect(cb.state(key)).toBe('HALF_OPEN');
    expect(() => cb.beforeCall(key, OPTS)).toThrow(CircuitOpenError); // a second concurrent call is rejected
  });

  it('a successful probe closes the circuit and resets the failure count', async () => {
    const cb = new CircuitBreaker();
    const key = 'provider:model';
    for (let i = 0; i < OPTS.failureThreshold; i++) cb.onFailure(key, OPTS);
    await sleep(OPTS.cooldownMs + 10);

    cb.beforeCall(key, OPTS);
    cb.onSuccess(key);

    expect(cb.state(key)).toBe('CLOSED');
    // Confirm the failure count actually reset: it should take a full
    // fresh threshold of failures to re-open, not just one more.
    cb.onFailure(key, OPTS);
    expect(cb.state(key)).toBe('CLOSED');
  });

  it('a failed probe re-opens the circuit', async () => {
    const cb = new CircuitBreaker();
    const key = 'provider:model';
    for (let i = 0; i < OPTS.failureThreshold; i++) cb.onFailure(key, OPTS);
    await sleep(OPTS.cooldownMs + 10);

    cb.beforeCall(key, OPTS);
    cb.onFailure(key, OPTS);

    expect(cb.state(key)).toBe('OPEN');
  });

  it('does not open when failures are spread outside the rolling window', async () => {
    const cb = new CircuitBreaker();
    const key = 'provider:model';
    const shortWindowOpts = { failureThreshold: 3, windowMs: 30, cooldownMs: 50 };

    cb.onFailure(key, shortWindowOpts);
    await sleep(40); // window expires
    cb.onFailure(key, shortWindowOpts);
    cb.onFailure(key, shortWindowOpts);

    // Only 2 failures landed inside any single window, even though 3 total occurred.
    expect(cb.state(key)).toBe('CLOSED');
  });

  it('tracks independent state per key', () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < OPTS.failureThreshold; i++) cb.onFailure('provider-a:model', OPTS);
    expect(cb.state('provider-a:model')).toBe('OPEN');
    expect(cb.state('provider-b:model')).toBe('CLOSED');
  });
});
