import React from 'react';
import { ApiNextQuestion } from './api';

/**
 * Combines the spec's "DiagnosticProgress" and "AdaptiveStatus" components
 * into one, since in practice they render together as a single status
 * strip above the question. Split them back apart if your design system
 * treats them as separate slots.
 *
 * Deliberately shows only: a coverage-based progress indicator and a
 * friendly, pre-templated status line (e.g. "Exploring a new area"). It
 * never renders `mode` or `reason` verbatim, and never fabricates a
 * "thinking" delay - see spec sections 46-48.
 */
export function DiagnosticProgress({ next }: { next: ApiNextQuestion }) {
  const domains = Object.entries(next.progress.coverage);
  const totalMin = domains.reduce((sum, [, c]) => sum + c.minimumRequired, 0) || 1;
  const totalAsked = Math.min(next.progress.questionsAsked, next.progress.maxQuestions);
  const pct = Math.min(100, Math.round((totalAsked / Math.max(next.progress.minQuestions, totalMin)) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#5b4636', letterSpacing: 0.2 }}>BUILDING YOUR APTITUDE PROFILE</span>
        <span style={{ fontSize: 13, color: '#8a7a68' }}>{next.progress.questionsAsked} answered</span>
      </div>

      <div style={{ height: 6, borderRadius: 999, background: '#eee3d6', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #c98a4b, #e0ac6f)',
            transition: 'width 400ms ease',
          }}
        />
      </div>

      {next.status && (
        <div style={{ fontSize: 14, color: '#4a3a2c', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: '50%', background: MODE_DOT[next.status.mode] ?? '#c98a4b', display: 'inline-block' }}
          />
          {next.status.friendlyStatus}
        </div>
      )}

      {next.progress.fatigueSeverity === 'high' && (
        <div role="status" style={{ fontSize: 13, color: '#8a5a2c', background: '#fbeedd', borderRadius: 8, padding: '8px 12px' }}>
          You've been at this a while - it's fine to pause and pick back up later.
        </div>
      )}
    </div>
  );
}

const MODE_DOT: Record<string, string> = {
  explore: '#4b9c8e',
  investigate: '#c98a4b',
  verify: '#b5563c',
  challenge: '#6a5acd',
  transfer: '#3b7dd8',
};
