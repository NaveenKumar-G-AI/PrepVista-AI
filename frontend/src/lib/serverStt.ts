/** Complete MediaRecorder windows; WS first, one REST retry per failed window.
 * The window promise is installed before recording starts. It covers final
 * dataavailable, onstop, transmission and transcript settlement.
 */
import { bounded, type AudioWindowEvidence, type CaptureEvidence } from './interview-capture';
import { appendPendingAudio, ensurePendingAttempt, flushPendingAudio, getPendingEvidence, savePendingWindowTranscript, type EvidenceScope, type PendingInterviewEvidence } from './pending-interview-evidence';
export type ServerSttStatus = 'idle' | 'connecting' | 'listening' | 'processing' | 'error';
export interface ServerSttOptions {
  sessionId: string; token: string; backendUrl: string; turnNumber: number;
  language?: string; windowMs?: number;
  evidenceScope?: EvidenceScope;
  onTranscript: (fullTranscript: string) => void;
  onStatus?: (status: ServerSttStatus) => void;
  onError?: (message: string) => void;
}
export interface StopResult {
  transcript: string;
  flush_status: 'ok' | 'timeout' | 'no_inflight';
  evidence: CaptureEvidence;
}
export interface SttResponse {
  final_transcript: string;
  transcription_status?: string;
  raw_transcript?: string;
  audio_id?: string;
  audio_url?: string | null;
  confidence?: number;
  provider?: string;
}
export function serverSttSupported(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && 'WebSocket' in window;
}
function pickMimeType(): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find(type => { try { return MediaRecorder.isTypeSupported(type); } catch { return false; } }) || '';
}
export class ServerSttSession {
  private opts: ServerSttOptions;
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private windowDone: Promise<void> | null = null;
  private transmissionQueue: Promise<void> = Promise.resolve();
  private startDone: Promise<void> | null = null;
  private stopDone: Promise<StopResult> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { id: string; resolve: (result: SttResponse | null) => void } | null = null;
  private abort = new AbortController();
  private active = false;
  private sealed = false;
  private rolling = '';
  private index = 0;
  private prefix = crypto.randomUUID();
  private evidence: CaptureEvidence = { audio_bytes: 0, speech_detected: false, failed: false, unintelligible: false, flush_status: 'no_inflight' };
  constructor(options: ServerSttOptions) {
    if (options.evidenceScope && (options.evidenceScope.sessionId !== options.sessionId || options.evidenceScope.turnNumber !== options.turnNumber)) {
      throw new Error('Audio recovery identity does not match this question.');
    }
    this.opts = { ...options, evidenceScope: options.evidenceScope ? { ...options.evidenceScope } : undefined };
  }
  get transcript() { return this.rolling.trim(); }
  start(): Promise<void> {
    if (this.startDone) return this.startDone;
    this.active = true;
    this.startDone = this.begin();
    return this.startDone;
  }
  private async begin() {
    this.opts.onStatus?.('connecting');
    try {
      // A failed storage-open must surface before recording promises recovery.
      if (this.opts.evidenceScope) await ensurePendingAttempt(this.opts.evidenceScope);
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.active) { this.stream.getTracks().forEach(track => track.stop()); return; }
      for (const track of this.stream.getTracks()) {
        track.addEventListener?.('ended', () => {
          if (!this.active || this.sealed) return;
          this.evidence.failed = true;
          this.opts.onError?.('Microphone disconnected. Captured audio will still be saved.');
        });
      }
      // Start capture immediately; a slow or unavailable socket must not eat the
      // opening words. Complete clips use REST until the socket is available.
      void bounded(this.openSocket(), 5000).catch(() => { this.ws?.close(); this.ws = null; });
      if (this.active) { this.opts.onStatus?.('listening'); this.recordWindow(); }
    } catch {
      this.evidence.failed = true;
      this.opts.onStatus?.('error');
      this.opts.onError?.('Audio capture could not be started.');
      throw new Error('Audio capture unavailable');
    }
  }
  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const baseUrl = this.opts.backendUrl.replace(/\/api\/?$/, '');
        const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/stt/${encodeURIComponent(this.opts.sessionId)}?token=${encodeURIComponent(this.opts.token)}`;
        const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => { this.pending?.resolve(null); reject(new Error('Transcription connection unavailable')); };
      ws.onclose = () => this.pending?.resolve(null);
      ws.onmessage = event => {
        let message: Record<string, unknown>;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (!message || typeof message !== 'object' || Array.isArray(message)) return;
        const pending = this.pending;
        if (!pending || this.sealed || message.turn_id !== pending.id) return;
        if (message.type === 'error') pending.resolve(null);
        if (message.type === 'final') {
          const valid = typeof message.final_transcript === 'string' && message.transcription_status !== 'partial_max_buffer' && message.transcription_status !== 'failed';
          pending.resolve(valid ? message as unknown as SttResponse : null);
        }
      };
    });
  }
  private recordWindow() {
    if (!this.active || !this.stream) return;
    const chunks: BlobPart[] = [];
    const id = `${this.opts.turnNumber}-${this.prefix}-${this.index++}`;
    const mime = pickMimeType();
    const capturedAt = new Date().toISOString();
    let complete!: () => void;
    this.windowDone = new Promise<void>(resolve => { complete = resolve; });
    try {
      const recorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
      this.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { this.evidence.failed = true; };
      recorder.onstop = () => {
        if (this.timer) clearTimeout(this.timer);
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        // Persist each completed clip immediately, not behind a slow STT request.
        const saved = this.opts.evidenceScope && blob.size
          ? appendPendingAudio(this.opts.evidenceScope, id, blob, capturedAt).catch(() => {
              this.evidence.recovery_failed = true;
              this.opts.onError?.('Browser recovery storage could not save audio. Keep this page open and retry.');
            })
          : Promise.resolve();
        this.transmissionQueue = this.transmissionQueue.then(async () => {
          await saved;
          await this.settleWindow(id, blob, capturedAt);
        })
          .catch(() => { this.evidence.failed = true; });
        // Media completion and provider settlement have separate deadlines.
        // A slow earlier window cannot make us discard later recorded clips.
        void saved.finally(complete);
        // Capture the next complete clip while earlier clips are transcribed.
        if (this.active && !this.sealed) this.recordWindow();
      };
      recorder.start();
      this.timer = setTimeout(() => { 
        if (recorder.state !== 'inactive') {
          try { recorder.requestData(); } catch { /* ignore */ }
          recorder.stop();
        } 
      }, this.opts.windowMs || 3000);
    } catch { this.evidence.failed = true; complete(); }
  }
  private async settleWindow(id: string, blob: Blob, capturedAt: string) {
    if (this.sealed || !blob.size) return;
    this.evidence.audio_bytes += blob.size;
    this.evidence.flush_status = 'ok';
    this.opts.onStatus?.('processing');
    let result: SttResponse | null = null;
    let transport: 'websocket' | 'rest' = 'websocket';
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { result = await bounded(this.sendWindow(id, blob), 55000); } catch { /* REST once */ }
      this.pending = null;
    }
    if (!result && !this.sealed) {
      transport = 'rest';
      result = await transcribeBlobViaRest({ ...this.opts, blob, turnId: id, signal: this.abort.signal });
    }
    if (this.sealed) return;
    const provenance = windowProvenance(id, blob, capturedAt, result, transport);
    (this.evidence.audio_windows ||= []).push(provenance);
    if (result && this.opts.evidenceScope) {
      try {
        await savePendingWindowTranscript(this.opts.evidenceScope, id, result.final_transcript, provenance, result.raw_transcript);
      } catch {
        this.evidence.recovery_failed = true;
        this.opts.onError?.('Browser recovery storage could not save the transcript. Keep this page open and retry.');
      }
    }
    if (!result) {
      this.evidence.failed = true;
      this.opts.onError?.('Transcription could not be completed.');
    } else if (!result.final_transcript.trim()) {
      this.evidence.unintelligible = true;
    } else {
      this.rolling = `${this.rolling} ${result.final_transcript.trim()}`.trim();
      this.opts.onTranscript(this.rolling);
    }
    this.opts.onStatus?.(this.active ? 'listening' : 'idle');
  }
  private async sendWindow(id: string, blob: Blob): Promise<SttResponse | null> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return null;
    const bytes = await blob.arrayBuffer();
    return new Promise(resolve => {
      this.pending = { id, resolve };
      try {
        ws.send(JSON.stringify({ type: 'turn_start', turn_id: id }));
        ws.send(bytes);
        ws.send(JSON.stringify({ type: 'turn_end', turn_id: id }));
      } catch { resolve(null); }
    });
  }
  stop(): Promise<StopResult> {
    if (this.stopDone) return this.stopDone;
    this.active = false;
    this.stopDone = this.finish();
    return this.stopDone;
  }
  private async finish(): Promise<StopResult> {
    try {
      // If stop races microphone initialization, begin() releases a late stream.
      if (this.startDone) await bounded(this.startDone, 6000);
      if (this.timer) clearTimeout(this.timer);
      if (this.recorder?.state !== 'inactive') this.recorder?.stop();
      if (this.windowDone) await bounded(this.windowDone, 65000);
      await this.transmissionQueue;
    } catch {
      this.evidence.failed = true;
      this.evidence.flush_status = 'timeout';
    } finally {
      this.sealed = true;
      this.abort.abort();
      this.pending?.resolve(null);
      this.pending = null;
      this.ws?.close();
      this.stream?.getTracks().forEach(track => track.stop());
      this.opts.onStatus?.('idle');
    }
    return { transcript: this.transcript, flush_status: this.evidence.flush_status, evidence: { ...this.evidence } };
  }
}
export async function transcribeBlobViaRest(params: {
  backendUrl: string; token: string; sessionId: string; turnNumber: number;
  blob: Blob; language?: string; turnId?: string; signal?: AbortSignal;
}): Promise<SttResponse | null> {
  const form = new FormData();
  const extension = params.blob.type.includes('mp4') ? 'mp4' : params.blob.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('audio', params.blob, `answer.${extension}`);
  form.append('session_id', params.sessionId);
  form.append('turn_id', params.turnId || String(params.turnNumber));
  form.append('language_hint', params.language || 'en-IN');
  const controller = new AbortController();
  const abort = () => controller.abort();
  params.signal?.addEventListener('abort', abort, { once: true });
  if (params.signal?.aborted) abort();
  const timer = setTimeout(abort, 55000);
  try {
    const response = await fetch(`${params.backendUrl.replace(/\/(?:api\/?)?$/, '')}/api/stt/transcribe`, {
      method: 'POST', headers: { Authorization: `Bearer ${params.token}` }, body: form, signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result?.final_transcript === 'string' && result.transcription_status !== 'failed' && result.transcription_status !== 'partial_max_buffer' ? result : null;
  } catch { return null; }
  finally { clearTimeout(timer); params.signal?.removeEventListener('abort', abort); }
}

function windowProvenance(id: string, blob: Blob, capturedAt: string, result: SttResponse | null, transport: 'websocket' | 'rest'): AudioWindowEvidence {
  return {
    window_id: id, audio_bytes: blob.size, mime_type: blob.type, captured_at: capturedAt,
    transcription_status: result ? 'success' : 'pending', transport,
    ...(typeof result?.final_transcript === 'string' ? { transcript: result.final_transcript } : {}),
    ...(typeof result?.raw_transcript === 'string' ? { raw_transcript: result.raw_transcript } : {}),
    ...(typeof result?.audio_id === 'string' ? { audio_id: result.audio_id } : {}),
    ...(typeof result?.audio_url === 'string' ? { audio_url: result.audio_url } : {}),
    ...(typeof result?.confidence === 'number' && Number.isFinite(result.confidence) ? { confidence: result.confidence } : {}),
    ...(typeof result?.provider === 'string' ? { provider: result.provider } : {}),
  };
}
/** Retry only unresolved, original audio clips under their immutable turn IDs.
 * The caller must verify authenticated ownership and session state before calling.
 * This never rewrites a frozen answer or submits an answer to the current turn.
 */
export async function retryPendingTranscription(params: {
  scope: EvidenceScope; backendUrl: string; token: string; language?: string; signal?: AbortSignal;
}): Promise<{ record: PendingInterviewEvidence; transcript: string; evidence: CaptureEvidence }> {
  await flushPendingAudio(params.scope);
  let record = await getPendingEvidence(params.scope);
  if (!record) throw new Error('Saved audio could not be found for this answer.');
  if (record.answer) throw new Error('A submitted original answer cannot be retranscribed. Retry its saved payload.');
  for (const audio of record.windows) {
    if (audio.transcript !== null || params.signal?.aborted) continue;
    const result = await transcribeBlobViaRest({ ...params, sessionId: record.scope.sessionId,
      turnNumber: record.scope.turnNumber, blob: audio.blob, turnId: audio.id });
    if (result) await savePendingWindowTranscript(record.scope, audio.id, result.final_transcript,
      windowProvenance(audio.id, audio.blob, audio.capturedAt, result, 'rest'), result.raw_transcript);
  }
  record = (await getPendingEvidence(params.scope))!;
  const transcript = [
    ...record.windows.map(audio => ({ text: audio.transcript?.trim() || '', capturedAt: audio.capturedAt })),
    ...(record.transcriptSegments || []).map(segment => ({ text: segment.text.trim(), capturedAt: segment.capturedAt })),
  ].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).map(segment => segment.text).filter(Boolean).join(' ');
  return { record, transcript, evidence: {
    audio_bytes: record.windows.reduce((total, audio) => total + audio.blob.size, 0),
    speech_detected: Boolean(transcript), failed: record.windows.some(audio => audio.transcript === null),
    unintelligible: record.windows.some(audio => audio.transcript === ''), flush_status: 'ok',
    audio_windows: record.windows.map(audio => ({
      ...(audio.provenance || windowProvenance(audio.id, audio.blob, audio.capturedAt, null, 'rest')),
      ...(audio.transcript !== null ? { transcript: audio.transcript } : {}),
      ...(typeof audio.rawTranscript === 'string' ? { raw_transcript: audio.rawTranscript } : {}),
    })),
    transcript_segments: (record.transcriptSegments || []).map(segment => ({
      segment_id: segment.id, text: segment.text, captured_at: segment.capturedAt,
    })),
  } };
}
