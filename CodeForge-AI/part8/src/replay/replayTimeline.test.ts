import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplayTimeline } from './replayTimeline';

const start = '2026-01-01T10:00:00.000Z';

test('computes MM:SS offsets relative to the real start time', () => {
  const timeline = buildReplayTimeline(start, [
    { id: 'e1', eventType: 'INTERVIEW_STARTED', payload: {}, createdAt: '2026-01-01T10:00:00.000Z' },
    { id: 'e2', eventType: 'CLARIFICATION_REQUESTED', payload: {}, createdAt: '2026-01-01T10:01:20.000Z' },
  ]);
  assert.equal(timeline[0].offsetLabel, '00:00');
  assert.equal(timeline[1].offsetLabel, '01:20');
});

test('sorts events chronologically even when passed out of order', () => {
  const timeline = buildReplayTimeline(start, [
    { id: 'later', eventType: 'TEST_PASSED', payload: {}, createdAt: '2026-01-01T10:18:30.000Z' },
    { id: 'earlier', eventType: 'INTERVIEW_STARTED', payload: {}, createdAt: '2026-01-01T10:00:00.000Z' },
  ]);
  assert.deepEqual(timeline.map(t => t.eventId), ['earlier', 'later']);
});

test('never fabricates an entry — only events actually passed in appear', () => {
  const timeline = buildReplayTimeline(start, [
    { id: 'only-one', eventType: 'INTERVIEW_STARTED', payload: {}, createdAt: start },
  ]);
  assert.equal(timeline.length, 1);
});

test('an unrecognized event type still gets a readable fallback label instead of crashing', () => {
  const timeline = buildReplayTimeline(start, [
    { id: 'e1', eventType: 'SOME_FUTURE_EVENT_TYPE', payload: {}, createdAt: start },
  ]);
  assert.equal(timeline[0].label, 'some future event type');
});

test('formats past an hour as H:MM:SS', () => {
  const timeline = buildReplayTimeline(start, [
    { id: 'e1', eventType: 'INTERVIEW_COMPLETED', payload: {}, createdAt: '2026-01-01T11:05:09.000Z' },
  ]);
  assert.equal(timeline[0].offsetLabel, '1:05:09');
});
