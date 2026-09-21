import { logEvent } from '../src/pipeline/logger';

test('logEvent redacts source code and secret-shaped fields', () => {
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line);
  });

  logEvent('test.event', { source: 'def leak(): return "should not appear"', apiKey: 'sk-super-secret', submissionId: 'abc123' });

  spy.mockRestore();

  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0]);
  expect(parsed.source).toBe('[REDACTED]');
  expect(parsed.apiKey).toBe('[REDACTED]');
  expect(parsed.submissionId).toBe('abc123');
  expect(JSON.stringify(parsed)).not.toContain('should not appear');
  expect(JSON.stringify(parsed)).not.toContain('sk-super-secret');
});
