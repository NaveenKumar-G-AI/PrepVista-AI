'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!loading) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-[28px] border p-6 shadow-[0_32px_72px_rgba(2,8,23,0.18)]"
        style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-3 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-tertiary" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
          Confirm action
        </div>
        <h2 id="confirm-dialog-title" className="text-2xl font-semibold tracking-[-0.02em] text-primary">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-7 text-secondary">
          {description}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-medium text-secondary transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              confirmTone === 'danger'
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-blue-500 text-white hover:bg-blue-400'
            }`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
