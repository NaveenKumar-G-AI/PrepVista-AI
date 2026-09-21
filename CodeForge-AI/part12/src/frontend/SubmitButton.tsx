import { useState } from 'react';

/**
 * CodeForge AI — Submission System
 * Client-side idempotency key generation lives here: one fresh key per logical submit
 * click, sent with the request so a retried/duplicated network call server-side is
 * still recognized as the same logical submission (see hashing/idempotency on the
 * server; this button's only job is to hand it a stable key for THIS click).
 */
export interface SubmitButtonProps {
  onSubmit: (idempotencyKey: string) => Promise<void>;
  disabledReason?: string; // e.g. "Deadline passed" — shown instead of a bare disabled button
}

function generateIdempotencyKey(): string {
  // crypto.randomUUID is available in every modern browser and in Node — no uuid
  // package dependency needed.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `cf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SubmitButton({ onSubmit, disabledReason }: SubmitButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    if (isSubmitting || disabledReason) return;
    setIsSubmitting(true);
    try {
      await onSubmit(generateIdempotencyKey());
    } finally {
      // Re-enabled promptly regardless of outcome — the editor and the button must
      // never freeze; a genuine duplicate click is handled server-side by the
      // idempotency key, not by permanently locking the UI.
      setIsSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting || Boolean(disabledReason)}
      aria-disabled={isSubmitting || Boolean(disabledReason)}
      title={disabledReason}
      className="cf-submit-btn"
    >
      <style>{`
        .cf-submit-btn {
          background: #ff6a3d; color: #1a0d06; border: none; border-radius: 8px;
          font-weight: 700; font-size: 14px; padding: 9px 20px; cursor: pointer;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .cf-submit-btn:hover:not(:disabled) { background: #ff7f57; }
        .cf-submit-btn:disabled { background: #4a4d54; color: #8a8d94; cursor: not-allowed; }
      `}</style>
      {isSubmitting ? 'Submitting…' : disabledReason ? disabledReason : 'Submit'}
    </button>
  );
}
