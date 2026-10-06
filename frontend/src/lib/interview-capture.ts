export type TerminalOutcome = 'EVALUATED' | 'NO_ANSWER' | 'TRANSCRIPTION_FAILED' | 'UNINTELLIGIBLE' | 'SKIPPED' | 'ABORTED';
export interface CaptureEvidence {
  audio_bytes: number;
  speech_detected: boolean;
  failed: boolean;
  unintelligible: boolean;
  flush_status: 'ok' | 'timeout' | 'no_inflight';
}
export interface CaptureResult { transcript: string; evidence: CaptureEvidence }
export function outcomeForCapture(result: CaptureResult, action?: 'SKIPPED' | 'ABORTED'): TerminalOutcome {
  if (action) return action;
  if (result.evidence.failed || result.evidence.flush_status === 'timeout') return 'TRANSCRIPTION_FAILED';
  if (result.evidence.unintelligible) return 'UNINTELLIGIBLE';
  if (result.transcript.trim()) return 'EVALUATED';
  if (result.evidence.audio_bytes || result.evidence.speech_detected) return 'UNINTELLIGIBLE';
  return 'NO_ANSWER';
}
/** Event completion with a deadline; timers bound failure, never synchronize success. */
export async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Capture deadline exceeded')), ms);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
/** One operation covers stopping, settlement, persistence and finalization. */
export function singleFlight<T>() {
  let current: Promise<T> | null = null;
  return (operation: () => Promise<T>): Promise<T> => {
    if (current) return current;
    current = Promise.resolve().then(operation).finally(() => { current = null; });
    return current;
  };
}
