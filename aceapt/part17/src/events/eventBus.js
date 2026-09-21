// Lightweight in-process event bus. In the real ACEAPT system this would
// publish onto the existing event architecture (Section 48) instead of
// keeping an in-memory list — this keeps the same emit(type, payload)
// call shape so swapping the transport later doesn't touch call sites.

const events = [];
const MAX_EVENTS = 1000;

function emit(type, payload = {}) {
  const evt = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    payload,
    at: Date.now(),
  };
  events.push(evt);
  if (events.length > MAX_EVENTS) events.shift();
  return evt;
}

function list({ studentId, type, limit = 100 } = {}) {
  return events
    .filter((e) => (studentId ? e.payload?.studentId === studentId : true))
    .filter((e) => (type ? e.type === type : true))
    .slice(-limit)
    .reverse(); // newest first
}

module.exports = { emit, list };
