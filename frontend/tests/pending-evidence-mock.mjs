// In-memory dependency for page/recorder VM tests only. Native IndexedDB behavior
// (commit, reload, quota, Blob survival and scope checks) runs separately in
// scripts/test_durable_browser.cjs against Chromium's actual storage engine.
export function createPendingEvidenceMock() {
  const records = new Map();
  const key = scope => JSON.stringify([scope.userId, scope.sessionId, scope.questionInstanceId, scope.attemptId]);
  const ensure = scope => {
    if (!records.has(key(scope))) records.set(key(scope), { key: key(scope), scope: { ...scope }, createdAt: new Date().toISOString(), windows: [], transcriptSegments: [], answer: null, accepted: null });
    return records.get(key(scope));
  };
  return {
    records,
    ensurePendingAttempt: async scope => ensure(scope),
    getPendingEvidence: async scope => records.get(key(scope)) || null,
    listPendingEvidence: async (userId, sessionId) => [...records.values()].filter(record => record.scope.userId === userId && record.scope.sessionId === sessionId),
    appendPendingAudio: async (scope, id, blob, capturedAt) => { const row = ensure(scope); if (!row.windows.some(window => window.id === id)) row.windows.push({ id, blob, capturedAt, mimeType: blob.type, transcript: null }); },
    savePendingWindowTranscript: async (scope, id, transcript, provenance) => { const window = ensure(scope).windows.find(value => value.id === id); if (!window) throw new Error('Missing original audio'); window.transcript = transcript; window.provenance = provenance; },
    appendPendingTranscript: async (scope, id, text, capturedAt) => { const row = ensure(scope); if (!row.transcriptSegments.some(segment => segment.id === id)) row.transcriptSegments.push({ id, text, capturedAt }); },
    flushPendingAudio: async () => {},
    savePendingAnswer: async (scope, answer) => { const row = ensure(scope); row.answer = structuredClone(answer); return row; },
    acknowledgePendingEvidence: async (scope, ack) => {
      if (!ack?.durable || ack.session_id !== scope.sessionId || ack.question_instance_id !== scope.questionInstanceId || ack.client_request_id !== scope.requestId) throw new Error('Invalid ACK fixture');
      records.delete(key(scope)); return true;
    },
  };
}
export function evidenceAck(sessionId, request) {
  return { durable: true, session_id: sessionId, question_instance_id: request.question_instance_id,
    client_request_id: request.client_request_id, accepted_at: '2026-10-08T12:00:00.000Z' };
}
export async function withEvidenceAck(response, url, options) {
  const match = String(url).match(/\/interviews\/([^/]+)\/answer$/);
  if (!match || !response.ok) return response;
  const data = await response.clone().json();
  const request = JSON.parse(options.body);
  if (request.expected_turn > 0 && data.action && !('evidence_ack' in data)) {
    return new Response(JSON.stringify({ ...data, evidence_ack: evidenceAck(decodeURIComponent(match[1]), request) }), { status: response.status, headers: response.headers });
  }
  return response;
}
