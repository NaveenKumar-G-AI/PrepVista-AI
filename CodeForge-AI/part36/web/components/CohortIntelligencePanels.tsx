import React from 'react';

/**
 * Illustrative starting components for Feature 36's dashboards
 * (spec section 57). Self-styled with inline styles — no Tailwind/CSS
 * framework dependency required, so these drop into any React app.
 * See web/README.md for font setup and what's intentionally not built
 * out here.
 *
 * Design concept: "evidence ledger." The product's central mechanic —
 * a claim is only as strong as its evidence coverage — is the visual
 * signature, not a decoration bolted on afterward: every stat renders
 * solid when coverage clears the bar and as a dashed, number-free
 * outline when it doesn't, everywhere in this file. Fraunces carries
 * section headers; IBM Plex Sans carries labels and prose; IBM Plex
 * Mono carries every number, mirroring how a lab notebook separates
 * observation from note.
 */

const tokens = {
  surface: '#0F1E1B',
  surfaceRaised: '#173330',
  surfaceRaised2: '#1D3B37',
  ink: '#EAF2EF',
  inkMuted: '#93AFA9',
  verified: '#4FD1B5',
  caution: '#EFAA5C',
  critical: '#E8746E',
  line: '#25443E',
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  body: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', Consolas, monospace",
};

type CoverageState = 'INSUFFICIENT' | 'LOW' | 'MEDIUM' | 'HIGH';
type MasteryLevel = 'NOT_ASSESSED' | 'EMERGING' | 'DEVELOPING' | 'PROFICIENT' | 'STRONG';
type TrendDirection = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_EVIDENCE';
type GapPriority = 'HIGH' | 'MODERATE' | 'EMERGING' | 'INSUFFICIENT_EVIDENCE';

const COVERAGE_COLOR: Record<CoverageState, string> = {
  INSUFFICIENT: tokens.caution,
  LOW: tokens.caution,
  MEDIUM: tokens.verified,
  HIGH: tokens.verified,
};

const COVERAGE_LABEL: Record<CoverageState, string> = {
  INSUFFICIENT: 'Insufficient evidence',
  LOW: 'Low coverage',
  MEDIUM: 'Medium coverage',
  HIGH: 'High coverage',
};

// ── CoverageIndicator ─────────────────────────────────────────────
// The signature primitive every other component here is built on.

export function CoverageIndicator({
  coverageState,
  coveragePct,
  label,
}: {
  coverageState: CoverageState;
  coveragePct?: number;
  label?: string;
}) {
  const solid = coverageState === 'MEDIUM' || coverageState === 'HIGH';
  const color = COVERAGE_COLOR[coverageState];
  const width = 96;
  const height = 8;
  const filled = coveragePct !== undefined ? Math.max(0, Math.min(1, coveragePct)) * width : width;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: tokens.body }}>
      <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0 }}>
        <rect x={0} y={0} width={width} height={height} rx={4} fill={tokens.surfaceRaised2} />
        {solid ? (
          <rect x={0} y={0} width={filled} height={height} rx={4} fill={color} />
        ) : (
          <rect
            x={0.5}
            y={0.5}
            width={width - 1}
            height={height - 1}
            rx={4}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {coveragePct !== undefined && (
        <span style={{ fontFamily: tokens.mono, fontSize: 12, color: tokens.ink, minWidth: 32 }}>
          {solid ? `${Math.round(coveragePct * 100)}%` : '—'}
        </span>
      )}
      <span style={{ fontSize: 12, color: tokens.inkMuted }}>{label ?? COVERAGE_LABEL[coverageState]}</span>
    </div>
  );
}

// ── SkillDistribution ────────────────────────────────────────────

const MASTERY_ORDER: MasteryLevel[] = ['NOT_ASSESSED', 'EMERGING', 'DEVELOPING', 'PROFICIENT', 'STRONG'];
const MASTERY_COLOR: Record<MasteryLevel, string> = {
  NOT_ASSESSED: '#1D3B37',
  EMERGING: '#316059',
  DEVELOPING: '#4A8F82',
  PROFICIENT: '#4FD1B5',
  STRONG: '#BFFCEA',
};
const TREND_GLYPH: Record<TrendDirection, { glyph: string; color: string }> = {
  IMPROVING: { glyph: '↑', color: tokens.verified },
  STABLE: { glyph: '→', color: tokens.inkMuted },
  DECLINING: { glyph: '↓', color: tokens.critical },
  INSUFFICIENT_EVIDENCE: { glyph: '·', color: tokens.inkMuted },
};

export interface SkillRow {
  skillName: string;
  coverageState: CoverageState;
  coveragePct: number;
  distribution: Record<MasteryLevel, number>;
  dominantLevel: MasteryLevel | null;
  trend: TrendDirection;
}

export function SkillDistribution({ skills }: { skills: SkillRow[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 20,
        background: tokens.surface,
        borderRadius: 10,
        fontFamily: tokens.body,
      }}
    >
      <div style={{ fontFamily: tokens.display, fontSize: 18, color: tokens.ink }}>Cohort skill distribution</div>
      {skills.map((skill) => {
        const total = MASTERY_ORDER.reduce((sum, level) => sum + skill.distribution[level], 0);
        const claimable = skill.coverageState !== 'INSUFFICIENT';
        const trend = TREND_GLYPH[skill.trend];
        return (
          <div key={skill.skillName} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ color: tokens.ink, fontSize: 14 }}>{skill.skillName}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: tokens.mono, fontSize: 12, color: trend.color }}>{trend.glyph}</span>
                <span style={{ fontFamily: tokens.mono, fontSize: 12, color: tokens.inkMuted }}>
                  {claimable && skill.dominantLevel ? skill.dominantLevel.replace('_', ' ').toLowerCase() : 'insufficient evidence'}
                </span>
              </span>
            </div>
            {claimable && total > 0 ? (
              <div style={{ display: 'flex', height: 10, borderRadius: 4, overflow: 'hidden' }}>
                {MASTERY_ORDER.map((level) => {
                  const count = skill.distribution[level];
                  if (count === 0) return null;
                  return (
                    <div
                      key={level}
                      title={`${level}: ${count}`}
                      style={{ width: `${(count / total) * 100}%`, background: MASTERY_COLOR[level] }}
                    />
                  );
                })}
              </div>
            ) : (
              <div style={{ height: 10, borderRadius: 4, border: `1.5px dashed ${tokens.caution}` }} />
            )}
            <CoverageIndicator coverageState={skill.coverageState} coveragePct={skill.coveragePct} />
          </div>
        );
      })}
    </div>
  );
}

// ── TrainingPriorityPanel ────────────────────────────────────────
// Doubles as the "Why?" panel from section 59 — every ranked item
// carries its rationale, never a bare score.

const GAP_COLOR: Record<GapPriority, string> = {
  HIGH: tokens.critical,
  MODERATE: tokens.caution,
  EMERGING: tokens.inkMuted,
  INSUFFICIENT_EVIDENCE: tokens.inkMuted,
};
const GAP_LABEL: Record<GapPriority, string> = {
  HIGH: 'High priority',
  MODERATE: 'Moderate',
  EMERGING: 'Emerging',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};

export interface TrainingPriorityRow {
  label: string;
  gapPriority: GapPriority;
  affectedStudents: number;
  rationale: string[];
}

export function TrainingPriorityPanel({ priorities }: { priorities: TrainingPriorityRow[] }) {
  return (
    <div style={{ background: tokens.surface, borderRadius: 10, fontFamily: tokens.body, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px 12px', fontFamily: tokens.display, fontSize: 18, color: tokens.ink }}>
        Where trainers should focus next
      </div>
      {priorities.map((p, i) => (
        <div
          key={p.label}
          style={{ padding: '14px 20px', borderTop: `1px solid ${tokens.line}`, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: tokens.mono, fontSize: 12, color: tokens.inkMuted }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ color: tokens.ink, fontSize: 15 }}>{p.label}</span>
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: tokens.mono,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: GAP_COLOR[p.gapPriority],
                border: `1px solid ${GAP_COLOR[p.gapPriority]}`,
                borderRadius: 999,
                padding: '3px 10px',
                whiteSpace: 'nowrap',
              }}
            >
              {GAP_LABEL[p.gapPriority]}
            </span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {p.rationale.map((r) => (
              <li key={r} style={{ fontSize: 12.5, color: tokens.inkMuted, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0 }}>·</span>
                {r}
              </li>
            ))}
          </ul>
          {p.affectedStudents > 0 && (
            <span style={{ fontFamily: tokens.mono, fontSize: 11, color: tokens.inkMuted }}>
              {p.affectedStudents} student{p.affectedStudents === 1 ? '' : 's'} affected
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── CohortExecutiveOverview ──────────────────────────────────────
// The flagship "what's happening, why, and what should we do next"
// briefing (spec section 81).

export interface ExecutiveOverviewData {
  cohortName: string;
  strongestAreas: string[];
  priorityGaps: string[];
  highestImpactRoleGap: string | null;
  trainingPriorities: string[];
  evidenceCoverageSummary: Record<string, CoverageState>;
  observedGrowth: string[];
  narrative?: string | null;
  restrictedReason?: string;
}

function Column({ eyebrow, items, tone }: { eyebrow: string; items: string[]; tone: 'verified' | 'critical' | 'muted' }) {
  const color = tone === 'verified' ? tokens.verified : tone === 'critical' ? tokens.critical : tokens.inkMuted;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 160px', minWidth: 160 }}>
      <span style={{ fontFamily: tokens.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: tokens.inkMuted }}>
        {eyebrow}
      </span>
      {items.length === 0 ? (
        <span style={{ fontSize: 13, color: tokens.inkMuted, fontStyle: 'italic' }}>None flagged</span>
      ) : (
        items.map((item) => (
          <span key={item} style={{ fontSize: 14, color, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {item}
          </span>
        ))
      )}
    </div>
  );
}

export function CohortExecutiveOverview({ data }: { data: ExecutiveOverviewData }) {
  if (data.restrictedReason) {
    return (
      <div style={{ padding: 24, background: tokens.surface, borderRadius: 10, border: `1.5px dashed ${tokens.caution}`, fontFamily: tokens.body }}>
        <div style={{ fontFamily: tokens.display, fontSize: 18, color: tokens.ink, marginBottom: 8 }}>{data.cohortName}</div>
        <div style={{ fontSize: 13, color: tokens.caution }}>{data.restrictedReason}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: tokens.surface, borderRadius: 10, fontFamily: tokens.body, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span style={{ fontFamily: tokens.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: tokens.inkMuted }}>
          Cohort technical intelligence
        </span>
        <div style={{ fontFamily: tokens.display, fontSize: 26, color: tokens.ink, marginTop: 4 }}>{data.cohortName}</div>
      </div>

      {data.narrative && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: tokens.ink, borderLeft: `2px solid ${tokens.verified}`, paddingLeft: 14 }}>
          {data.narrative}
        </p>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Column eyebrow="Strongest areas" items={data.strongestAreas} tone="verified" />
        <Column eyebrow="Priority gaps" items={data.priorityGaps} tone="critical" />
        <Column eyebrow="Training priority" items={data.trainingPriorities.slice(0, 3)} tone="muted" />
      </div>

      {data.highestImpactRoleGap && (
        <div style={{ fontSize: 13, color: tokens.inkMuted }}>
          Highest-impact role gap: <span style={{ color: tokens.ink }}>{data.highestImpactRoleGap}</span>
        </div>
      )}

      {Object.keys(data.evidenceCoverageSummary).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 16, borderTop: `1px solid ${tokens.line}` }}>
          {Object.entries(data.evidenceCoverageSummary).map(([skill, state]) => (
            <div key={skill} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: tokens.inkMuted }}>{skill}</span>
              <CoverageIndicator coverageState={state} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Showcase (demo data, matches the API's real response shapes) ──

const DEMO_OVERVIEW: ExecutiveOverviewData = {
  cohortName: 'CSE 2026',
  strongestAreas: ['Python', 'Data Structures'],
  priorityGaps: ['SQL'],
  highestImpactRoleGap: 'Backend Developer',
  trainingPriorities: ['SQL', 'System Design'],
  evidenceCoverageSummary: { Python: 'HIGH', SQL: 'INSUFFICIENT', 'Data Structures': 'HIGH', APIs: 'MEDIUM' },
  observedGrowth: ['Data Structures improving', 'Python relatively stable'],
  narrative: 'The cohort shows strong signal in Python and Data Structures. SQL evidence is currently insufficient for most of the cohort, so it is flagged rather than scored.',
};

const DEMO_SKILLS: SkillRow[] = [
  {
    skillName: 'Python',
    coverageState: 'HIGH',
    coveragePct: 0.88,
    distribution: { NOT_ASSESSED: 2, EMERGING: 3, DEVELOPING: 10, PROFICIENT: 20, STRONG: 15 },
    dominantLevel: 'PROFICIENT',
    trend: 'STABLE',
  },
  {
    skillName: 'SQL',
    coverageState: 'INSUFFICIENT',
    coveragePct: 0.18,
    distribution: { NOT_ASSESSED: 41, EMERGING: 4, DEVELOPING: 4, PROFICIENT: 1, STRONG: 0 },
    dominantLevel: null,
    trend: 'INSUFFICIENT_EVIDENCE',
  },
  {
    skillName: 'Data Structures',
    coverageState: 'HIGH',
    coveragePct: 0.82,
    distribution: { NOT_ASSESSED: 3, EMERGING: 5, DEVELOPING: 12, PROFICIENT: 18, STRONG: 12 },
    dominantLevel: 'PROFICIENT',
    trend: 'IMPROVING',
  },
];

const DEMO_PRIORITIES: TrainingPriorityRow[] = [
  {
    label: 'SQL',
    gapPriority: 'HIGH',
    affectedStudents: 38,
    rationale: ['High-priority skill gap observed across the cohort.', 'Central to one or more target roles for this cohort.'],
  },
  {
    label: 'System Design',
    gapPriority: 'MODERATE',
    affectedStudents: 22,
    rationale: ['Moderate skill gap observed across the cohort.', 'Historically responsive to focused training.'],
  },
];

/** Drop this in anywhere to see the whole set with representative
 * data — replace DEMO_* with your live API responses. */
export default function CohortIntelligenceShowcase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <CohortExecutiveOverview data={DEMO_OVERVIEW} />
      <SkillDistribution skills={DEMO_SKILLS} />
      <TrainingPriorityPanel priorities={DEMO_PRIORITIES} />
    </div>
  );
}
