/** Temporary browser crash recovery. No tokens, TTL eviction, or permanent audio storage.
 * Only the authenticated owner/session is queried. Immutable attempt/turn identity
 * and an explicit committed-evidence ACK protect against cross-turn cleanup.
 */
import type { AudioWindowEvidence, CaptureEvidence, TerminalOutcome } from './interview-capture';

export interface EvidenceScope {
  userId: string;
  sessionId: string;
  questionInstanceId: string;
  attemptId: string;
  requestId: string;
  turnNumber: number;
}
export interface PendingAnswerPayload {
  text: string;
  key: string;
  terminal: {
    expected_turn: number;
    question_instance_id?: string | null;
    terminal_outcome?: Exclude<TerminalOutcome, 'EVALUATED'>;
    capture_evidence?: CaptureEvidence;
    end_after_answer?: boolean;
  };
  elapsedSeconds?: number;
  answerDurationSeconds?: number;
  assistance?: Record<string, unknown>;
}
export interface DurableEvidenceAck {
  durable: true;
  session_id: string;
  question_instance_id: string;
  client_request_id: string;
  evidence_id?: string;
  accepted_at: string;
}
export interface PendingAudioWindow {
  id: string;
  blob: Blob;
  mimeType: string;
  capturedAt: string;
  /** Null means no successful provider result; empty string is a valid result. */
  transcript: string | null;
  provenance?: AudioWindowEvidence;
  rawTranscript?: string;
}
export interface PendingInterviewEvidence {
  key: string;
  scope: EvidenceScope;
  createdAt: string;
  updatedAt: string;
  windows: PendingAudioWindow[];
  /** Browser SpeechRecognition final segments; interim guesses are never journaled. */
  transcriptSegments?: { id: string; text: string; capturedAt: string }[];
  answer: PendingAnswerPayload | null;
  accepted: DurableEvidenceAck | null;
}

const DATABASE = 'prepvista-pending-interview-evidence';
const STORE = 'attempts';
const OWNER_SESSION = 'owner-session';
class EvidenceConflictError extends Error {}
// Quota or disk failure cannot be made crash-durable. Keep the live copy for a
// visible retry; never evict an older unacknowledged attempt to create room.
const volatileAudio = new Map<string, Map<string, { blob: Blob; capturedAt: string }>>();
const volatileTranscripts = new Map<string, Map<string, { transcript: string; provenance?: AudioWindowEvidence; rawTranscript?: string }>>();
const volatileSegments = new Map<string, Map<string, { text: string; capturedAt: string }>>();
let opened: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Browser recovery storage is unavailable. Please keep this page open.'));
  if (!opened) opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex(OWNER_SESSION, ['scope.userId', 'scope.sessionId']);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opened = null; };
      resolve(db);
    };
    request.onerror = () => { opened = null; reject(request.error || new Error('Browser recovery storage could not be opened.')); };
    request.onblocked = () => { opened = null; reject(new Error('Browser recovery storage is blocked by another open tab.')); };
  }).catch(error => { opened = null; throw error; });
  return opened;
}
function scopeKey(scope: EvidenceScope): string {
  if (![scope.userId, scope.sessionId, scope.questionInstanceId, scope.attemptId, scope.requestId].every(value => typeof value === 'string' && value.length > 0)
      || !Number.isInteger(scope.turnNumber) || scope.turnNumber < 1) throw new Error('A complete authenticated question/attempt identity is required for recovery.');
  return JSON.stringify([scope.userId, scope.sessionId, scope.questionInstanceId, scope.attemptId]);
}
function sameScope(a: EvidenceScope, b: EvidenceScope) {
  return scopeKey(a) === scopeKey(b) && a.requestId === b.requestId && a.turnNumber === b.turnNumber;
}
function writeTransaction(db: IDBDatabase): IDBTransaction {
  // Strict durability requests flushing writes before reporting transaction completion.
  // Older browsers still use their normal IndexedDB commit semantics.
  try { return db.transaction(STORE, 'readwrite', { durability: 'strict' }); }
  catch { return db.transaction(STORE, 'readwrite'); }
}
async function update(scope: EvidenceScope, change: (record: PendingInterviewEvidence) => PendingInterviewEvidence | null): Promise<PendingInterviewEvidence | null> {
  const key = scopeKey(scope);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = writeTransaction(db), store = tx.objectStore(STORE);
    let result: PendingInterviewEvidence | null = null;
    let failure: unknown;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || tx.error || new Error('Browser recovery write was not committed.'));
    tx.onerror = () => { /* onabort owns rejection and includes quota/storage failures */ };
    const get = store.get(key);
    get.onsuccess = () => {
      try {
        const now = new Date().toISOString();
        const record = get.result as PendingInterviewEvidence | undefined;
        if (record && !sameScope(record.scope, scope)) throw new Error('Recovery attempt identity cannot change.');
        result = change(record || { key, scope: { ...scope }, createdAt: now, updatedAt: now, windows: [], answer: null, accepted: null });
        if (result) { result.updatedAt = now; store.put(result); }
        else store.delete(key);
      } catch (error) { failure = error; tx.abort(); }
    };
  });
}
export async function ensurePendingAttempt(scope: EvidenceScope): Promise<PendingInterviewEvidence> {
  return (await update(scope, record => record))!;
}
export async function appendPendingAudio(scope: EvidenceScope, windowId: string, blob: Blob, capturedAt = new Date().toISOString()): Promise<void> {
  if (!windowId || !blob.size) return;
  const key = scopeKey(scope);
  const waiting = volatileAudio.get(key) || new Map<string, { blob: Blob; capturedAt: string }>();
  if (!waiting.has(windowId)) waiting.set(windowId, { blob, capturedAt });
  volatileAudio.set(key, waiting);
  const captured = waiting.get(windowId)!;
  await update(scope, record => {
    if (record.answer || record.accepted) throw new EvidenceConflictError('Finalized original evidence cannot acquire a different audio window.');
    const existing = record.windows.find(window => window.id === windowId);
    if (existing) {
      if (existing.blob.size !== captured.blob.size || existing.mimeType !== captured.blob.type) throw new EvidenceConflictError('Original audio window cannot change.');
      return record;
    }
    record.windows.push({ id: windowId, blob: captured.blob, mimeType: captured.blob.type, capturedAt: captured.capturedAt, transcript: null });
    return record;
  }).catch(error => {
    if (error instanceof EvidenceConflictError) { waiting.delete(windowId); if (!waiting.size) volatileAudio.delete(key); }
    throw error;
  });
  waiting.delete(windowId);
  if (!waiting.size) volatileAudio.delete(key);
}
export async function flushPendingAudio(scope: EvidenceScope): Promise<void> {
  const waiting = volatileAudio.get(scopeKey(scope));
  if (waiting) for (const [id, audio] of [...waiting]) await appendPendingAudio(scope, id, audio.blob, audio.capturedAt);
  const transcripts = volatileTranscripts.get(scopeKey(scope));
  if (transcripts) for (const [id, value] of [...transcripts]) await savePendingWindowTranscript(scope, id, value.transcript, value.provenance, value.rawTranscript);
  const segments = volatileSegments.get(scopeKey(scope));
  if (segments) for (const [id, value] of [...segments]) await appendPendingTranscript(scope, id, value.text, value.capturedAt);
}
export async function appendPendingTranscript(scope: EvidenceScope, segmentId: string, text: string, capturedAt = new Date().toISOString()): Promise<void> {
  if (!segmentId || !text) return;
  const key = scopeKey(scope);
  const waiting = volatileSegments.get(key) || new Map<string, { text: string; capturedAt: string }>();
  const original = waiting.get(segmentId);
  if (original && original.text !== text) throw new Error('Original final transcript segment cannot change.');
  if (!original) waiting.set(segmentId, { text, capturedAt });
  volatileSegments.set(key, waiting);
  const captured = waiting.get(segmentId)!;
  await update(scope, record => {
    const segments = record.transcriptSegments ||= [];
    const existing = segments.find(segment => segment.id === segmentId);
    if (existing) {
      if (existing.text !== captured.text) throw new EvidenceConflictError('Original final transcript segment cannot change.');
      return record;
    }
    if (record.answer || record.accepted) throw new EvidenceConflictError('Finalized original evidence cannot acquire a different transcript segment.');
    segments.push({ id: segmentId, text: captured.text, capturedAt: captured.capturedAt });
    return record;
  }).catch(error => {
    if (error instanceof EvidenceConflictError) { waiting.delete(segmentId); if (!waiting.size) volatileSegments.delete(key); }
    throw error;
  });
  waiting.delete(segmentId);
  if (!waiting.size) volatileSegments.delete(key);
}
export async function savePendingWindowTranscript(scope: EvidenceScope, windowId: string, transcript: string, provenance?: AudioWindowEvidence, rawTranscript?: string): Promise<void> {
  const key = scopeKey(scope);
  const waiting = volatileTranscripts.get(key) || new Map<string, { transcript: string; provenance?: AudioWindowEvidence; rawTranscript?: string }>();
  const original = waiting.get(windowId);
  if (original && original.transcript !== transcript) throw new Error('Original window transcript cannot change.');
  if (original?.rawTranscript !== undefined && rawTranscript !== undefined && original.rawTranscript !== rawTranscript) throw new Error('Original raw window transcript cannot change.');
  // If disk storage temporarily fails, retry the first provider result itself.
  // Repeating transcription could otherwise replace already-captured words.
  if (!original) waiting.set(windowId, structuredClone({ transcript, provenance, rawTranscript }));
  volatileTranscripts.set(key, waiting);
  const captured = waiting.get(windowId)!;
  await update(scope, record => {
    const window = record.windows.find(item => item.id === windowId);
    if (!window) throw new Error('Original audio must be committed before its transcript.');
    if ((record.answer || record.accepted) && window.transcript === null) throw new EvidenceConflictError('Finalized original evidence cannot acquire a different transcript.');
    if (window.transcript !== null) {
      if (window.transcript !== transcript) throw new EvidenceConflictError('Original window transcript cannot change.');
      if (window.rawTranscript !== undefined && rawTranscript !== undefined && window.rawTranscript !== rawTranscript) throw new EvidenceConflictError('Original raw window transcript cannot change.');
      return record;
    }
    if (captured.provenance && (captured.provenance.window_id !== window.id || captured.provenance.audio_bytes !== window.blob.size)) throw new EvidenceConflictError('Transcription provenance does not match the original audio window.');
    window.transcript = captured.transcript;
    if (!window.provenance && captured.provenance) window.provenance = structuredClone(captured.provenance);
    if (window.rawTranscript === undefined && captured.rawTranscript !== undefined) window.rawTranscript = captured.rawTranscript;
    return record;
  }).catch(error => {
    if (error instanceof EvidenceConflictError) { waiting.delete(windowId); if (!waiting.size) volatileTranscripts.delete(key); }
    throw error;
  });
  waiting.delete(windowId);
  if (!waiting.size) volatileTranscripts.delete(key);
}
export async function savePendingAnswer(scope: EvidenceScope, answer: PendingAnswerPayload): Promise<PendingInterviewEvidence> {
  if (answer.key !== scope.requestId || answer.terminal.question_instance_id !== scope.questionInstanceId || answer.terminal.expected_turn !== scope.turnNumber) {
    throw new Error('Answer does not belong to this immutable question/attempt.');
  }
  await flushPendingAudio(scope);
  return (await update(scope, record => {
    if (record.answer && JSON.stringify(record.answer) !== JSON.stringify(answer)) throw new Error('Original pending answer cannot change.');
    if (!record.answer) record.answer = structuredClone(answer);
    return record;
  }))!;
}
export async function getPendingEvidence(scope: EvidenceScope): Promise<PendingInterviewEvidence | null> {
  const key = scopeKey(scope);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => {
      const record = request.result as PendingInterviewEvidence | undefined;
      if (record && !sameScope(record.scope, scope)) { reject(new Error('Recovery attempt identity cannot change.')); return; }
      resolve(record || null);
    };
    tx.onabort = () => reject(tx.error || new Error('Browser recovery record could not be read.'));
    tx.onerror = () => { /* rejection happens on abort */ };
  });
}
export async function listPendingEvidence(userId: string, sessionId: string): Promise<PendingInterviewEvidence[]> {
  if (!userId || !sessionId) return [];
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).index(OWNER_SESSION).getAll([userId, sessionId]);
    tx.oncomplete = () => resolve((request.result as PendingInterviewEvidence[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    tx.onabort = () => reject(tx.error || new Error('Browser recovery records could not be read.'));
    tx.onerror = () => { /* rejection happens on abort */ };
  });
}
export async function acknowledgePendingEvidence(scope: EvidenceScope, ack: DurableEvidenceAck): Promise<boolean> {
  if (!ack || ack.durable !== true || ack.session_id !== scope.sessionId || ack.question_instance_id !== scope.questionInstanceId || ack.client_request_id !== scope.requestId || !ack.accepted_at || !Number.isFinite(Date.parse(ack.accepted_at))) {
    throw new Error('Durable acknowledgement does not match the saved answer.');
  }
  const remaining = await update(scope, record => {
    if (!record.answer) throw new Error('An unsent local attempt cannot be acknowledged.');
    // A metadata-only TRANSCRIPTION_FAILED ACK cannot preserve an unresolved Blob.
    // Keep such records discoverable; no automatic age/quota cleanup deletes them.
    if (record.windows.some(window => window.transcript === null)) {
      record.accepted = { ...ack };
      return record;
    }
    return null;
  });
  if (remaining === null) {
    volatileAudio.delete(scopeKey(scope));
    volatileTranscripts.delete(scopeKey(scope));
    volatileSegments.delete(scopeKey(scope));
  }
  return remaining === null;
}
