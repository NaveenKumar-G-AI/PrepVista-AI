/** Complete MediaRecorder windows; WS first, one REST retry per failed window.
 * The window promise is installed before recording starts. It covers final
 * dataavailable, onstop, transmission and transcript settlement.
 */
import { bounded, type CaptureEvidence } from './interview-capture';
export type ServerSttStatus = 'idle' | 'connecting' | 'listening' | 'processing' | 'error';
export interface ServerSttOptions {
  sessionId: string; token: string; backendUrl: string; turnNumber: number;
  language?: string; windowMs?: number;
  onTranscript: (fullTranscript: string) => void;
  onStatus?: (status: ServerSttStatus) => void;
  onError?: (message: string) => void;
}
export interface StopResult {
  transcript: string;
  flush_status: 'ok' | 'timeout' | 'no_inflight';
  evidence: CaptureEvidence;
}
interface SttResponse { final_transcript: string; transcription_status?: string }
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
  constructor(options: ServerSttOptions) { this.opts = options; }
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
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.active) { this.stream.getTracks().forEach(track => track.stop()); return; }
      try { await bounded(this.openSocket(), 5000); } catch { this.ws?.close(); this.ws = null; }
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
    let complete!: () => void;
    this.windowDone = new Promise<void>(resolve => { complete = resolve; });
    try {
      const recorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
      this.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { this.evidence.failed = true; complete(); };
      recorder.onstop = () => {
        if (this.timer) clearTimeout(this.timer);
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        this.transmissionQueue = this.transmissionQueue.then(() => this.settleWindow(id, blob))
          .catch(() => { this.evidence.failed = true; });
        void this.transmissionQueue.finally(complete);
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
  private async settleWindow(id: string, blob: Blob) {
    if (this.sealed || !blob.size) return;
    this.evidence.audio_bytes += blob.size;
    this.evidence.flush_status = 'ok';
    this.opts.onStatus?.('processing');
    let result: SttResponse | null = null;
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { result = await bounded(this.sendWindow(id, blob), 55000); } catch { /* REST once */ }
      this.pending = null;
    }
    if (!result && !this.sealed) {
      result = await transcribeBlobViaRest({ ...this.opts, blob, turnId: id, signal: this.abort.signal });
    }
    if (this.sealed) return;
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
  form.append('audio', params.blob, 'answer.webm');
  form.append('session_id', params.sessionId);
  form.append('turn_id', params.turnId || String(params.turnNumber));
  form.append('language_hint', params.language || 'en-IN');
  const controller = new AbortController();
  const abort = () => controller.abort();
  params.signal?.addEventListener('abort', abort, { once: true });
  if (params.signal?.aborted) abort();
  const timer = setTimeout(abort, 55000);
  try {
    const response = await fetch(`${params.backendUrl.replace(/\/$/, '')}/api/stt/transcribe`, {
      method: 'POST', headers: { Authorization: `Bearer ${params.token}` }, body: form, signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result?.final_transcript === 'string' && result.transcription_status !== 'failed' ? result : null;
  } catch { return null; }
  finally { clearTimeout(timer); params.signal?.removeEventListener('abort', abort); }
}
