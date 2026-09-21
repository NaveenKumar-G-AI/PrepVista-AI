'use client';

import { useEffect, useState } from 'react';
import { loadGoldenScenarioFixture, type GoldenScenarioData } from '../lib/fixtures/golden-scenario-fixture.js';
import { GrowthDashboard } from '../components/GrowthDashboard.js';
import { SkillEvolutionView } from '../components/SkillEvolutionView.js';
import { GrowthTimeline } from '../components/GrowthTimeline.js';
import { MilestoneCard } from '../components/MilestoneCard.js';
import { InstructorGrowthView } from '../components/InstructorGrowthView.js';
import { cfTheme } from '../lib/theme.js';

/**
 * Illustrative Next.js page (e.g. app/growth/demo/page.tsx) wiring every
 * component to the golden-scenario fixture, so the whole student +
 * instructor experience can be reviewed without a live database. Swap
 * loadGoldenScenarioFixture() for a real fetch against
 * /api/growth/profile, /api/growth/skills/[id]/history, etc. (see
 * src/api/next-routes.example.ts) to point this at production data —
 * every component's props already match those endpoints' response
 * shapes, so nothing about the components themselves needs to change.
 */
export default function GrowthDemoPage() {
  const [data, setData] = useState<GoldenScenarioData | null>(null);
  const [view, setView] = useState<'student' | 'instructor'>('student');

  useEffect(() => {
    let cancelled = false;
    loadGoldenScenarioFixture().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div style={{ background: cfTheme.color.graphite, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: cfTheme.font.mono, color: cfTheme.color.textMuted, fontSize: 13 }}>Loading growth profile…</span>
      </div>
    );
  }

  return (
    <div style={{ background: cfTheme.color.graphite, minHeight: '100vh', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <ToggleButton active={view === 'student'} onClick={() => setView('student')} label="Student view" />
        <ToggleButton active={view === 'instructor'} onClick={() => setView('instructor')} label="Instructor view" />
      </div>

      {view === 'student' ? (
        <>
          <GrowthDashboard profile={data.profile} skillLabels={data.skillLabels} studentFirstName="Jordan" />
          <SkillEvolutionView skillId="debugging-1" skillLabel={data.skillLabels['debugging-1']} history={data.debuggingHistory} />
          <SkillEvolutionView skillId="algorithms-1" skillLabel={data.skillLabels['algorithms-1']} history={data.algorithmsHistory} />
          <div style={{ background: cfTheme.color.graphite, padding: '28px 26px', borderRadius: 14, maxWidth: 640, width: '100%' }}>
            <h3 style={{ fontFamily: cfTheme.font.display, fontWeight: 600, fontSize: 18, color: cfTheme.color.textPrimary, margin: '0 0 12px' }}>Milestones</h3>
            <MilestoneCard milestones={data.milestones} skillLabels={data.skillLabels} />
          </div>
          <GrowthTimeline events={data.timeline} skillLabels={data.skillLabels} />
        </>
      ) : (
        <InstructorGrowthView studentLabel="Jordan — golden-student" profile={data.profile} skillLabels={data.skillLabels} />
      )}
    </div>
  );
}

function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: cfTheme.font.mono,
        fontSize: 12,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        padding: '8px 16px',
        borderRadius: 999,
        border: `1px solid ${active ? cfTheme.color.ember : cfTheme.color.plateBorder}`,
        background: active ? `${cfTheme.color.ember}22` : 'transparent',
        color: active ? cfTheme.color.ember : cfTheme.color.textMuted,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
