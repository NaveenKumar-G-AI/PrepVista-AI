/**
 * PrepVista AI — Server-side STT client (Fix 1, step 1)
 * =====================================================
 * Replaces the browser Web Speech API with cross-browser audio capture
 * (MediaRecorder) streamed to the FastAPI backend over a WebSocket, with a REST
 * fallback. Works on Chrome, Firefox, Safari, and Edge — MediaRecorder + Opus is
 * supported on all of them.
 *
 * This module is GATED by NEXT_PUBLIC_STT_SERVER_ENABLED in the interview page.
 * When the flag is off, the page keeps using its existing client-side
 * recognition and this module is never constructed.
 *
 * Design — "rolling windows":
 * MediaRecorder timeslice chunks after the first do NOT carry the WebM header,
 * so chunks 2..N are not independently decodable. To get a reliable, near-live
 * transcript we instead record short, COMPLETE clips: a fresh MediaRecorder per
 * ~3s window. Each window's full (header-included) blob is sent over the
 * WebSocket as one turn; the server transcribes it and returns the text, which
 * we append to a rolling transcript and surface via onTranscript(). The hosting
 * component writes that straight into the same refs it already uses for Web
 * Speech, so the synchronous "read transcript at submit" path is unchanged.
 *
 * Every window's audio is retained server-side for the dispute/audit trail.
 */

export type ServerSttStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'error';

export interface ServerSttOptions {
  sessionId: string;
  /** Supabase access token — passed as ?token= since browsers can't set WS headers. */
  token: string;
  /** Backend origin, e.g. https://api.prepvista.ai (no trailing slash). */
  backendUrl: string;
  /** Interview turn number, used to namespace retained audio. */
  turnNumber: number;
  language?: string;
  /** ~milliseconds per recording window. */
  windowMs?: number;
  /** Called with the full rolling transcript whenever it grows. */
  onTranscript: (fullTranscript: string) => void;
  /** Coarse lifecycle status for "listening..." UI. */
  onStatus?: (status: ServerSttStatus) => void;
  /** Non-fatal errors (the caller decides whether to show them). */
  onError?: (message: string) => void;
}

/** True only when the runtime can actually do server STT (browser + APIs present). */
export function serverSttSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    'WebSocket' in window
  );
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const mt of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mt)) return mt;
    } catch {
      /* ignore */
    }
  }
  return '';
}

/** Captures continuously; transcription is queued independently of recording. */
export class ServerSttSession {
  private opts: Required<Pick<ServerSttOptions, 'language' | 'windowMs'>> & ServerSttOptions;
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private rolling = '';
  private windowIdx = 0;
  private active = false;
  private mimeType = '';
  private recordingDone: Promise<void> = Promise.resolve();
  private queue: Promise<void> = Promise.resolve();
  private stopPromise: Promise<string> | null = null;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: { id: string; resolve: (text: string) => void; reject: (error: Error) => void } | null = null;
  private queuedWindows = 0;
  private failure: Error | null = null;

  constructor(options: ServerSttOptions) {
    this.opts = { language: 'en-IN', windowMs: 3000, ...options };
  }

  get transcript(): string { return this.rolling.trim(); }
  private status(s: ServerSttStatus) { this.opts.onStatus?.(s); }

  private wsUrl(): string {
    const base = this.opts.backendUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    return `${base}/ws/stt/${encodeURIComponent(this.opts.sessionId)}?token=${encodeURIComponent(this.opts.token)}`;
  }

  async start(): Promise<void> {
    if (this.active || this.stopPromise) return;
    this.active = true;
    this.status('connecting');
    try {
      if (!serverSttSupported()) throw new Error('Audio capture is not supported in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission can resolve after navigation or cancellation.
      if (!this.active) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.mimeType = pickMimeType();
      try { await this.openSocket(); }
      catch { this.ws?.close(); this.ws = null; } // authenticated REST fallback
      if (!this.active) { this.release(); return; }
      this.status('listening');
      this.recordNextWindow();
    } catch (error) {
      this.active = false;
      this.release();
      this.status('error');
      throw error;
    }
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl());
      this.ws = ws;
      const timer = setTimeout(() => { reject(new Error('Transcription connection timed out.')); ws.close(); }, 8000);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Transcription connection failed.')); };
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new Error('Transcription connection closed.'));
        this.pending?.reject(new Error('Transcription connection closed.'));
      };
      ws.onmessage = ev => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); }
        catch { return; }
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
        // A delayed result must never satisfy a later audio window.
        if (!this.pending || String(msg.turn_id) !== this.pending.id) return;
        if (msg.type === 'final') this.pending.resolve(typeof msg.final_transcript === 'string' ? msg.final_transcript.trim() : '');
        if (msg.type === 'error') this.pending.reject(new Error('Could not transcribe this audio window.'));
      };
    });
  }

  private recordNextWindow() {
    if (!this.active || !this.stream) return;
    const chunks: BlobPart[] = [];
    const turnId = `${this.opts.turnNumber}-${this.windowIdx++}`;
    try {
      const recorder = this.mimeType ? new MediaRecorder(this.stream, { mimeType: this.mimeType }) : new MediaRecorder(this.stream);
      this.recorder = recorder;
      this.recordingDone = new Promise<void>(resolve => {
        recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
        recorder.onerror = () => this.fail(new Error('Microphone recording failed.'));
        recorder.onstop = () => {
          if (this.windowTimer) clearTimeout(this.windowTimer);
          this.windowTimer = null;
          const blob = new Blob(chunks, { type: recorder.mimeType || this.mimeType || 'audio/webm' });
          if (blob.size) this.enqueueWindow(turnId, blob);
          resolve();
          // Start the next complete clip immediately, not after network inference.
          if (this.active) this.recordNextWindow();
        };
        recorder.start();
        this.windowTimer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, this.opts.windowMs);
      });
    } catch { this.fail(new Error('Audio recording failed to start.')); }
  }

  private fail(error: Error) {
    if (!this.failure) this.opts.onError?.(error.message);
    this.failure = error;
    this.active = false;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.status('error');
  }

  private enqueueWindow(id: string, blob: Blob) {
    if (++this.queuedWindows > 10) {
      this.fail(new Error('Transcription is too slow. Please retry your answer.'));
      return;
    }
    this.queue = this.queue.then(async () => {
      if (this.failure) return;
      let text: string;
      try { text = await this.sendWindow(id, blob); }
      catch {
        const result = await transcribeBlobViaRest({ ...this.opts, blob, turnId: id });
        if (!result) throw new Error('Could not capture all of your answer. Please retry before submitting.');
        text = result.final_transcript;
      }
      if (text) {
        this.rolling = `${this.rolling} ${text}`.trim();
        this.opts.onTranscript(this.rolling);
      }
    }).catch(error => this.fail(error instanceof Error ? error : new Error('Transcription failed.')))
      .finally(() => { this.queuedWindows--; });
  }

  private async sendWindow(id: string, blob: Blob): Promise<string> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Socket unavailable');
    const bytes = await blob.arrayBuffer();
    return new Promise<string>((resolve, reject) => {
      const settle = (text: string | null, error?: Error) => {
        clearTimeout(timer);
        if (this.pending?.id === id) this.pending = null;
        if (error) reject(error); else resolve(text || '');
      };
      const timer = setTimeout(() => settle(null, new Error('Transcription timed out.')), 12000);
      this.pending = { id, resolve: text => settle(text), reject: error => settle(null, error) };
      try {
        ws.send(JSON.stringify({ type: 'turn_start', turn_id: id, mime_type: blob.type, language_hint: this.opts.language }));
        ws.send(bytes);
        ws.send(JSON.stringify({ type: 'turn_end' }));
      } catch { settle(null, new Error('Audio send failed.')); }
    });
  }

  private release() {
    if (this.windowTimer) clearTimeout(this.windowTimer);
    this.windowTimer = null;
    this.ws?.close(); this.ws = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.recorder = null;
  }

  /** Flush the final recorder event AND all queued responses before submitting. */
  stop(): Promise<string> {
    if (this.stopPromise) return this.stopPromise;
    this.active = false;
    this.stopPromise = (async () => {
      try {
        if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
        await this.recordingDone;
        await this.queue;
        if (this.failure) throw this.failure;
        return this.transcript;
      } finally { this.release(); this.status(this.failure ? 'error' : 'idle'); }
    })();
    return this.stopPromise;
  }
}

/**
 * REST fallback (Fix 1, step 5): POST a complete audio blob to /api/stt/transcribe.
 * Used when the WebSocket cannot be established. Same JSON shape as the WS final.
 */
export async function transcribeBlobViaRest(params: {
  backendUrl: string;
  token: string;
  sessionId: string;
  turnNumber: number;
  turnId?: string;
  blob: Blob;
  language?: string;
}): Promise<{ final_transcript: string; confidence: number; audio_url: string | null } | null> {
  const form = new FormData();
  const extension = params.blob.type.includes('mp4') ? 'mp4' : params.blob.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('audio', params.blob, `answer.${extension}`);
  form.append('session_id', params.sessionId);
  form.append('turn_id', params.turnId ?? String(params.turnNumber));
  form.append('language_hint', params.language || 'en-IN');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${params.backendUrl.replace(/\/$/, '')}/api/stt/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}` },
      body: form,
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || typeof data.final_transcript !== 'string') return null;
    return data;
  } catch {
    return null;
  } finally { clearTimeout(timeout); }
}
