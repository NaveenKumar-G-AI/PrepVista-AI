import { normalizeError, redact } from '../src/errors';
import { AuditLog } from '../src/telemetry/AuditLog';
import { ErrorCategory } from '../src/types';

describe('redact()', () => {
  it('redacts secret-shaped keys at the top level', () => {
    const result = redact({ apiKey: 'sk-abcdef123456', name: 'fine' }) as Record<string, unknown>;
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.name).toBe('fine');
  });

  it('redacts secret-shaped keys recursively, including inside arrays', () => {
    const result = redact({
      headers: [{ Authorization: 'Bearer sk-xyz' }, { 'x-api-key': 'abc' }],
      nested: { session: { password: 'hunter2' } },
    }) as any;

    expect(result.headers[0].Authorization).toBe('[REDACTED]');
    expect(result.headers[1]['x-api-key']).toBe('[REDACTED]');
    expect(result.nested.session.password).toBe('[REDACTED]');
  });

  it('redacts the entire subtree when the CONTAINER key itself looks sensitive, rather than recursing into it', () => {
    // "credentials" itself matches the secret-key pattern — redacting the
    // whole value it points to (instead of trying to selectively recurse)
    // is the conservative, safe choice for a security redaction utility:
    // it can never accidentally leave something sensitive un-redacted one
    // level down inside a container that was already flagged as sensitive.
    const result = redact({ nested: { credentials: { password: 'hunter2', username: 'not-actually-secret' } } }) as any;
    expect(result.nested.credentials).toBe('[REDACTED]');
  });

  it('redacts a value that looks like a secret even under an innocuous key name', () => {
    const result = redact({ someField: 'sk-abcdefghijklmnop' }) as Record<string, unknown>;
    expect(result.someField).toBe('[REDACTED]');
  });

  it('leaves ordinary values untouched', () => {
    const result = redact({ requestId: 'req_123', count: 5, ok: true }) as Record<string, unknown>;
    expect(result).toEqual({ requestId: 'req_123', count: 5, ok: true });
  });
});

describe('AuditLog — redaction is applied before storage, not just at read time', () => {
  it('never stores a raw secret, even if the caller passes one in', () => {
    const log = new AuditLog();
    log.record('CONFIGURATION_CHANGE', { entity: 'provider', apiKey: 'sk-super-secret-value' }, { organizationId: 'org1' });

    const events = log.listForOrganization('org1');
    expect(events).toHaveLength(1);
    expect(events[0].details.apiKey).toBe('[REDACTED]');
    expect(JSON.stringify(events[0])).not.toContain('sk-super-secret-value');
  });

  it('listForOrganization is tenant-scoped and never returns another organization\'s events', () => {
    const log = new AuditLog();
    log.record('AI_REQUEST', {}, { organizationId: 'org-a' });
    log.record('AI_REQUEST', {}, { organizationId: 'org-b' });

    expect(log.listForOrganization('org-a')).toHaveLength(1);
    expect(log.listForOrganization('org-b')).toHaveLength(1);
    expect(log.listForOrganization('org-c')).toHaveLength(0);
  });
});

describe('normalizeError() — error taxonomy mapping', () => {
  it('maps a timeout-shaped error to TIMEOUT and marks it retryable', () => {
    const result = normalizeError(new Error('Request timed out after 30000ms'), 'test-provider');
    expect(result.category).toBe(ErrorCategory.TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it('maps a 401/unauthorized-shaped error to AUTHENTICATION and marks it NOT retryable', () => {
    const result = normalizeError(new Error('401 Unauthorized: invalid api key'), 'test-provider');
    expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
    expect(result.retryable).toBe(false);
  });

  it('maps a 429/rate-limit-shaped error to RATE_LIMIT and marks it retryable', () => {
    const result = normalizeError(new Error('429 rate limit exceeded'), 'test-provider');
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(result.retryable).toBe(true);
  });

  it('never leaks the raw provider message into the public-facing message', () => {
    const result = normalizeError(new Error('provider internal stack trace with secret details'), 'test-provider');
    expect(result.message).not.toContain('stack trace');
    expect(result.internalDetail).toContain('test-provider');
  });

  it('passes an already-normalized AIGatewayError through unchanged', () => {
    const original = normalizeError(new Error('timeout'), 'p');
    expect(normalizeError(original, 'p')).toBe(original);
  });
});
