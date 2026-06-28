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

export class ServerSttSession {
  private opts: Required<Pick<ServerSttOptions, 'language' | 'windowMs'>> & ServerSttOptions;
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private windowChunks: BlobPart[] = [];
  private rolling = '';
  private windowIdx = 0;
  private active = false;
  private mimeType = '';
  /** Resolver for the in-flight window's server 'final' frame. */
  private pendingFinal: ((text: string) => void) | null = null;

  constructor(options: ServerSttOptions) {
    this.opts = {
      language: 'en-IN',
      windowMs: 3000,
      ...options,
    };
  }

  get transcript(): string {
    return this.rolling.trim();
  }

  private status(s: ServerSttStatus) {
    this.opts.onStatus?.(s);
  }

  private wsUrl(): string {
    const base = this.opts.backendUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    const token = encodeURIComponent(this.opts.token);
    return `${base}/ws/stt/${encodeURIComponent(this.opts.sessionId)}?token=${token}`;
  }

  /** Open mic + WebSocket and begin recording windows. */
  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.status('connecting');

    if (!serverSttSupported()) {
      this.status('error');
      this.opts.onError?.('Your browser cannot capture audio. Please try a different browser.');
      this.active = false;
      throw new Error('server STT unsupported');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType = pickMimeType();

    await this.openSocket();
    this.status('listening');
    this.recordNextWindow();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl());
      } catch (e) {
        reject(e);
        return;
      }
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => {
        // Surface as a connect failure; caller may fall back to REST.
        this.opts.onError?.('Live transcription connection failed.');
        reject(new Error('ws error'));
      };
      this.ws.onclose = () => {
        if (this.active) this.opts.onError?.('Live transcription disconnected.');
      };
      this.ws.onmessage = (ev) => this.onSocketMessage(ev);
    });
  }

  private onSocketMessage(ev: MessageEvent) {
    let msg: any;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.type === 'final') {
      const text: string = (msg.final_transcript || '').trim();
      if (this.pendingFinal) {
        const resolve = this.pendingFinal;
        this.pendingFinal = null;
        resolve(text);
      }
    } else if (msg.type === 'error') {
      this.opts.onError?.(msg.message || 'Could not process audio, please try again.');
      if (this.pendingFinal) {
        const resolve = this.pendingFinal;
        this.pendingFinal = null;
        resolve('');
      }
    }
  }

  /** Record one ~windowMs clip, send it, await its transcript, then loop. */
  private recordNextWindow() {
    if (!this.active || !this.stream) return;

    this.windowChunks = [];
    const turnId = `${this.opts.turnNumber}-${this.windowIdx++}`;
    let recorder: MediaRecorder;
    try {
      recorder = this.mimeType
        ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
        : new MediaRecorder(this.stream);
    } catch {
      this.opts.onError?.('Audio recording failed to start.');
      this.status('error');
      return;
    }
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.windowChunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(this.windowChunks, { type: this.mimeType || 'audio/webm' });
      if (blob.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const text = await this.sendWindow(turnId, blob);
        if (text) {
          this.rolling = `${this.rolling} ${text}`.trim();
          this.opts.onTranscript(this.rolling);
        }
      }
      // Loop the next window if still listening.
      if (this.active) {
        this.recordNextWindow();
      }
    };

    recorder.start();
    // Close this window after windowMs — produces a complete, decodable clip.
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
    }, this.opts.windowMs);
  }

  /** Send one window over the WS and resolve with its server transcript. */
  private sendWindow(turnId: string, blob: Blob): Promise<string> {
    return new Promise<string>((resolve) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve('');
        return;
      }
      this.status('processing');
      this.pendingFinal = (text) => {
        this.status(this.active ? 'listening' : 'idle');
        resolve(text);
      };
      // Guard: if the server never answers, don't hang the window loop.
      const guard = window.setTimeout(() => {
        if (this.pendingFinal) {
          this.pendingFinal = null;
          resolve('');
        }
      }, 12000);

      ws.send(JSON.stringify({ type: 'turn_start', turn_id: turnId }));
      blob.arrayBuffer().then((buf) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(buf);
          ws.send(JSON.stringify({ type: 'turn_end' }));
        } else {
          window.clearTimeout(guard);
          resolve('');
        }
      });
    });
  }

  /** Stop recording + close the socket. Returns the full rolling transcript. */
  async stop(): Promise<string> {
    this.active = false;
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      }
    } catch {
      /* ignore */
    }
    // Give the final in-flight window a brief moment to return its transcript.
    await new Promise((r) => window.setTimeout(r, 400));

    try {
      this.ws?.send(JSON.stringify({ type: 'close' }));
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.status('idle');
    return this.transcript;
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
  blob: Blob;
  language?: string;
}): Promise<{ final_transcript: string; confidence: number; audio_url: string | null } | null> {
  const form = new FormData();
  form.append('audio', params.blob, 'answer.webm');
  form.append('session_id', params.sessionId);
  form.append('turn_id', String(params.turnNumber));
  form.append('language_hint', params.language || 'en-IN');

  try {
    const resp = await fetch(`${params.backendUrl.replace(/\/$/, '')}/api/stt/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}` },
      body: form,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
