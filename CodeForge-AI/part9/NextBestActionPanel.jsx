import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Sample data below mirrors the ACTUAL output of scripts/smoke_test.ts in
// this project (real code, run against real Postgres — see the project
// README). This is what a real GET /recommendations/next-action response
// looks like once this panel is wired to your API. It is demonstration
// data, not a live connection.
// ---------------------------------------------------------------------------

const COLORS = {
  ink: '#10131A',
  surface: '#171B24',
  surfaceRaised: '#1E2430',
  border: '#2B3242',
  text: '#E4E7EE',
  textMuted: '#8991A3',
  textFaint: '#5B6478',
  accent: '#E3A53D',
  accentDim: '#8A6A2E',
  fail: '#7A3B3B',
};

const STATE_COLORS = {
  UNKNOWN: '#4A5165',
  EXPOSED: '#6B7280',
  LEARNING: '#5B8DBE',
  DEVELOPING: '#4FA0A6',
  FUNCTIONAL: '#5FAE7A',
  STRONG: '#3F9E5C',
  MASTERED: '#E3A53D',
  STALE: '#C6733A',
};

const FONT_MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const FONT_SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif";

const SAMPLE_ROLE = 'Software Engineer';

const SAMPLE_SKILLS = [
  { name: 'Arrays', state: 'MASTERED', confidence: 0.78 },
  { name: 'Recursion', state: 'STRONG', confidence: 0.65 },
  { name: 'Graphs', state: 'DEVELOPING', confidence: 0.42 },
  { name: 'DP State Modeling', state: 'EXPOSED', confidence: 0.0, focus: true },
  { name: 'Dynamic Programming', state: 'UNKNOWN', confidence: 0.0 },
];

const EVIDENCE_TAPE = [
  { source: 'PRACTICE', quality: 0.35, passed: false },
  { source: 'PRACTICE', quality: 0.35, passed: false },
  { source: 'PRACTICE', quality: 0.35, passed: false },
];

const REASONS_DETERMINISTIC = [
  'Software Engineer requires this skill.',
  'Current evidence puts Dynamic Programming at UNKNOWN (confidence 0%).',
  'Dynamic Programming depends on DP State Modeling, which is currently EXPOSED.',
  'Recommending the prerequisite instead of more attempts at the target skill.',
];

const REASONS_AI_POLISHED = [
  'Software Engineer roles lean heavily on dynamic programming, so this one matters for the target role.',
  "There's no independent evidence yet for Dynamic Programming itself — that's expected this early.",
  'The real blocker looks like DP State Modeling: three attempts so far, none of them independent.',
  'Worth shoring that up before another DP problem, rather than repeating the same wall.',
];

const SECONDARY = [
  { skill: 'Arrays', action: 'RETENTION CHECK', note: 'Confirm the skill is still solid after time has passed.' },
  { skill: 'Graphs', action: 'TRANSFER PRACTICE', note: 'Recognize this skill applies to an unfamiliar problem without being told.' },
];

function StateTick({ state }) {
  return <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: STATE_COLORS[state] }} />;
}

export default function NextBestActionPanel() {
  const [aiAssist, setAiAssist] = useState(true);
  const reasons = aiAssist ? REASONS_AI_POLISHED : REASONS_DETERMINISTIC;

  return (
    <div style={{ background: COLORS.ink, color: COLORS.text, fontFamily: FONT_SANS }} className="w-full rounded-lg p-5 sm:p-6">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');`}</style>

      <div className="flex items-center justify-between mb-5 pb-4" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        <div>
          <div className="text-xs tracking-widest uppercase" style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}>
            Target role
          </div>
          <div className="text-lg" style={{ fontFamily: FONT_MONO }}>{SAMPLE_ROLE}</div>
        </div>
        <button
          onClick={() => setAiAssist((a) => !a)}
          className="text-xs px-3 py-1.5 rounded"
          style={{
            fontFamily: FONT_MONO,
            background: COLORS.surfaceRaised,
            border: `1px solid ${COLORS.border}`,
            color: aiAssist ? COLORS.accent : COLORS.textMuted,
          }}
        >
          AI ASSIST: {aiAssist ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-1 space-y-1">
          <div className="text-xs tracking-widest uppercase mb-2" style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}>
            Mastery map
          </div>
          {SAMPLE_SKILLS.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ background: s.focus ? COLORS.surfaceRaised : 'transparent' }}
            >
              <StateTick state={s.state} />
              <span className="text-sm truncate" style={{ color: s.focus ? COLORS.text : COLORS.textMuted }}>
                {s.name}
              </span>
            </div>
          ))}
        </div>

        <div className="md:col-span-2 rounded-md p-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          <div className="text-xs tracking-widest uppercase mb-1" style={{ color: COLORS.accent, fontFamily: FONT_MONO }}>
            Next best action · primary
          </div>
          <div className="text-xl sm:text-2xl mb-4" style={{ fontFamily: FONT_MONO }}>
            Review prerequisite → <span style={{ color: COLORS.accent }}>DP State Modeling</span>
          </div>

          <div className="mb-4">
            <div className="text-xs mb-1.5" style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}>
              EVIDENCE ({EVIDENCE_TAPE.length} record{EVIDENCE_TAPE.length === 1 ? '' : 's'})
            </div>
            <div className="flex items-end gap-1 h-10">
              {EVIDENCE_TAPE.map((e, i) => (
                <div
                  key={i}
                  title={`${e.source} · ${e.passed ? 'passed' : 'failed'}`}
                  className="flex-1 rounded-sm"
                  style={{ height: `${Math.max(18, e.quality * 100)}%`, background: e.passed ? STATE_COLORS.STRONG : COLORS.fail }}
                />
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs mb-2" style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}>
              WHY {aiAssist ? '· AI-POLISHED' : '· DETERMINISTIC (AI ASSIST OFF)'}
            </div>
            <ul className="space-y-1.5">
              {reasons.map((r, i) => (
                <li key={i} className="text-sm flex gap-2" style={{ color: COLORS.textMuted }}>
                  <span style={{ color: COLORS.accentDim }}>—</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs mb-5" style={{ color: COLORS.textFaint }}>
            Expected outcome:{' '}
            <span style={{ color: COLORS.textMuted }}>Shore up the underlying skill currently blocking Dynamic Programming.</span>
          </div>

          <button className="text-sm px-4 py-2 rounded" style={{ background: COLORS.accent, color: COLORS.ink, fontWeight: 500 }}>
            Start guided practice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {SECONDARY.map((s) => (
          <div key={s.skill} className="rounded-md p-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <div className="text-xs mb-1" style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}>
              SECONDARY · {s.action}
            </div>
            <div className="text-sm mb-1" style={{ fontFamily: FONT_MONO }}>
              {s.skill}
            </div>
            <div className="text-xs" style={{ color: COLORS.textMuted }}>
              {s.note}
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs mt-4 pt-3" style={{ color: COLORS.textFaint, borderTop: `1px solid ${COLORS.border}` }}>
        Sample data for demonstration — wires to{' '}
        <code style={{ fontFamily: FONT_MONO, color: COLORS.textMuted }}>GET /recommendations/next-action</code> once integrated. Toggle
        "AI assist" to see the deterministic-fallback reasoning this engine always has ready, even when AI is off.
      </div>
    </div>
  );
}
