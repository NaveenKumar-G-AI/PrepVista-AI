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
 *
 * Bug-fix notes:
 * - Per-window state machine prevents duplicate transcript append from late WS + REST.
 * - stop() properly awaits in-flight operations instead of sleeping.
 * - WS drop and guard timeout surface debounced errors instead of silent loss.
 * - Audio blobs are preserved for REST fallback when WS fails.
 */

export type ServerSttStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'error';

/** Per-window lifecycle state — exactly one transcript result is accepted. */
type WindowState = 'PENDING' | 'WS_SUCCEEDED' | 'REST_FALLBACK' | 'FAILED';

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

/** Flush result returned by stop() so callers know if the final window was captured. */
export interface StopResult {
  transcript: string;
  flush_status: 'ok' | 'timeout' | 'no_inflight';
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

  /** Promise that resolves when the current in-flight sendWindow completes. */
  private inflightSend: Promise<string> | null = null;

  /** Per-window state: prevents duplicate transcript from late WS + REST. */
  private currentWindowState: WindowState = 'PENDING';

  /** Last Blob from the most recent recording window — preserved for REST fallback. */
  private lastWindowBlob: Blob | null = null;
  private lastWindowTurnId: string = '';

  /** Debounce: timestamp of last user-facing error surfaced. */
  private lastErrorSurfacedAt = 0;
  /** Minimum ms between user-facing error messages. */
  private static readonly ERROR_DEBOUNCE_MS = 10_000;

  /** Count of consecutive failed windows (for internal tracking). */
  private consecutiveFailures = 0;

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

  /** Surface an error to the user, debounced to avoid spam on flaky networks. */
  private surfaceError(code: string, message: string) {
    // Always log internally (caller can wire to analytics)
    console.warn(`[ServerSTT] ${code}:`, message);

    const now = Date.now();
    if (now - this.lastErrorSurfacedAt < ServerSttSession.ERROR_DEBOUNCE_MS) {
      return; // Suppress — too soon since last user-facing error
    }
    this.lastErrorSurfacedAt = now;
    this.opts.onError?.(message);
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
        if (this.active) this.surfaceError('STT_SOCKET_DROPPED', 'Some speech could not be transcribed. Please retry this answer if needed.');
      };
      this.ws.onmessage = (ev) => this.onSocketMessage(ev);
    });
  }

  private onSocketMessage(ev: MessageEvent) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const msg = parsed as Record<string, unknown>;
    if (msg.type === 'final') {
      const text = typeof msg.final_transcript === 'string' ? msg.final_transcript.trim() : '';
      if (this.pendingFinal) {
        const resolve = this.pendingFinal;
        this.pendingFinal = null;
        resolve(text);
      }
    } else if (msg.type === 'error') {
      this.surfaceError(
        'STT_SERVER_ERROR',
        typeof msg.message === 'string' ? msg.message : 'Could not process audio, please try again.',
      );
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
    this.currentWindowState = 'PENDING';
    const turnId = `${this.opts.turnNumber}-${this.windowIdx++}`;
    this.lastWindowTurnId = turnId;

    let recorder: MediaRecorder;
    try {
      recorder = this.mimeType
        ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
        : new MediaRecorder(this.stream);
    } catch {
      this.surfaceError('STT_RECORDER_FAILED', 'Audio recording failed to start.');
      this.status('error');
      return;
    }
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.windowChunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(this.windowChunks, { type: this.mimeType || 'audio/webm' });
      // Preserve blob for potential REST fallback
      this.lastWindowBlob = blob;

      if (blob.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const sendPromise = this.sendWindow(turnId, blob);
        this.inflightSend = sendPromise;
        const text = await sendPromise;
        this.inflightSend = null;

        // Only accept transcript if this window is still PENDING (no REST fallback raced us)
        if (text && this.currentWindowState === 'PENDING') {
          this.currentWindowState = 'WS_SUCCEEDED';
          this.rolling = `${this.rolling} ${text}`.trim();
          this.opts.onTranscript(this.rolling);
          this.consecutiveFailures = 0;
        } else if (!text && this.currentWindowState === 'PENDING') {
          this.currentWindowState = 'FAILED';
          this.consecutiveFailures++;
        }
      } else if (blob.size > 0) {
        // WebSocket not available — attempt REST fallback
        this.currentWindowState = 'FAILED';
        this.consecutiveFailures++;
        await this.attemptRestFallback(turnId, blob);
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

  /** Attempt REST fallback transcription for a window whose WS path failed. */
  private async attemptRestFallback(turnId: string, blob: Blob): Promise<void> {
    // Don't attempt if window already succeeded via WS
    if (this.currentWindowState === 'WS_SUCCEEDED') return;

    try {
      const result = await transcribeBlobViaRest({
        backendUrl: this.opts.backendUrl,
        token: this.opts.token,
        sessionId: this.opts.sessionId,
        turnNumber: this.opts.turnNumber,
        blob,
        language: this.opts.language,
      });

      // Only accept if still no transcript for this window
      if (result?.final_transcript) {
        this.currentWindowState = 'REST_FALLBACK';
        const text = result.final_transcript.trim();
        if (text) {
          this.rolling = `${this.rolling} ${text}`.trim();
          this.opts.onTranscript(this.rolling);
          this.consecutiveFailures = 0;
        }
      }
    } catch {
      // REST fallback also failed — window is truly lost
      console.warn('[ServerSTT] REST fallback also failed for window', turnId);
    }
  }

  /** Send one window over the WS and resolve with its server transcript. */
  private sendWindow(turnId: string, blob: Blob): Promise<string> {
    return new Promise<string>((resolve) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        this.surfaceError('STT_SOCKET_DROPPED', 'Some speech could not be transcribed. Please retry this answer if needed.');
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
          this.surfaceError('STT_WINDOW_TIMEOUT', 'Some speech could not be transcribed. Please retry this answer if needed.');
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
          this.surfaceError('STT_SOCKET_DROPPED', 'Some speech could not be transcribed. Please retry this answer if needed.');
          resolve('');
        }
      });
    });
  }

  /**
   * Stop recording + close the socket. Returns the full rolling transcript and
   * a flush_status indicating whether the final in-flight window was captured.
   *
   * Flow:
   * 1. Stop accepting new windows (this.active = false)
   * 2. Finalize current MediaRecorder window
   * 3. Await any in-flight sendWindow()
   * 4. Await pendingFinal (bounded timeout)
   * 5. Return accumulated transcript + flush status
   */
  async stop(): Promise<StopResult> {
    this.active = false;
    let flushStatus: StopResult['flush_status'] = 'no_inflight';

    // Step 1: Stop the current MediaRecorder so its onstop fires and
    // produces the final blob + sendWindow call.
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      }
    } catch {
      /* ignore */
    }

    // Step 2: Await the in-flight sendWindow (set by recorder.onstop).
    // The recorder.onstop handler is async and sets this.inflightSend.
    // We need a brief moment for onstop to fire first (it's event-driven).
    await new Promise((r) => window.setTimeout(r, 50));

    if (this.inflightSend) {
      flushStatus = 'ok';
      try {
        // Bounded wait for the in-flight send to complete
        const result = await Promise.race([
          this.inflightSend,
          new Promise<string>((resolve) =>
            window.setTimeout(() => resolve('__timeout__'), 8000)
          ),
        ]);
        if (result === '__timeout__') {
          flushStatus = 'timeout';
          console.warn('[ServerSTT] Final window flush timed out after 8s');
        }
      } catch {
        flushStatus = 'timeout';
      }
    } else if (this.pendingFinal) {
      // There's a pendingFinal but no tracked inflightSend — wait for it directly
      flushStatus = 'ok';
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            const originalResolve = this.pendingFinal;
            if (!originalResolve) {
              resolve();
              return;
            }
            this.pendingFinal = (text: string) => {
              originalResolve(text);
              resolve();
            };
          }),
          new Promise<void>((resolve) =>
            window.setTimeout(() => {
              // Force-resolve pendingFinal if still waiting
              if (this.pendingFinal) {
                const pf = this.pendingFinal;
                this.pendingFinal = null;
                pf('');
              }
              resolve();
            }, 8000)
          ),
        ]);
      } catch {
        flushStatus = 'timeout';
      }
    }

    // Step 3: Clean up resources
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
    this.inflightSend = null;
    this.lastWindowBlob = null;
    this.status('idle');

    return { transcript: this.transcript, flush_status: flushStatus };
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
