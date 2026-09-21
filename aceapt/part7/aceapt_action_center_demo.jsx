import { useState } from 'react';
import {
  Activity, Target, Flag, TrendingUp, LayoutGrid, Clock, ChevronDown,
  Play, CheckCircle2, Circle, CircleDot, RotateCcw, Sparkles,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ---------------------------------------------------------------------------
// Design tokens — dark "readiness instrument" palette. Applied via inline
// style (only core Tailwind utilities are available in this environment, so
// custom hex values can't go through className).
// ---------------------------------------------------------------------------
const C = {
  ink: '#0F1B2D',
  panel: '#172A42',
  panel2: '#1D3350',
  line: '#2A3D59',
  ivory: '#EDF1F7',
  slate: '#8DA0B8',
  slateDim: '#5E7291',
  amber: '#F0A83C',
  teal: '#3FBF8F',
  rose: '#E2584B',
};

// ---------------------------------------------------------------------------
// Sample journey — illustrative data shaped to match the product plan's own
// walkthrough (§8 Action Center card, §27 progress story, §42 demo script).
// Four stages: LEARN → TIMED_PRACTICE → ERROR_REPAIR → MIXED_PRACTICE,
// readiness climbing 51% → 62% → 73% → 79% → 81%.
// ---------------------------------------------------------------------------
const STAGES = [
  {
    shortLabel: 'Concept repair',
    before: 51,
    after: 62,
    action: {
      type: 'LEARN',
      priority: 'CRITICAL',
      skill: 'Data Interpretation',
      category: 'Quantitative',
      duration: 15,
      reason: "Concept mastery is low — you're missing a reliable method for reading combined graph-and-table questions.",
      why: 'Your accuracy here is 41%, well below your other topics, and error review shows the wrong method being applied on combination questions. This is a genuine knowledge gap, not a speed issue, so a short concept walkthrough helps more than another timed drill right now.',
      metric: 'Correctly apply the right method on 4 of 5 practice questions',
      verification: 'Short concept-check quiz',
      before_metrics: { concept_mastery: 48 },
      after_metrics: { concept_mastery: 82 },
    },
  },
  {
    shortLabel: 'Timed practice',
    before: 62,
    after: 73,
    action: {
      type: 'TIMED_PRACTICE',
      priority: 'CRITICAL',
      skill: 'Data Interpretation',
      category: 'Quantitative',
      duration: 10,
      reason: 'Concept understanding is strong now. Your biggest limitation is solving speed under time pressure.',
      why: "You solve these correctly during untimed practice, but accuracy falls once a timer is running — your average solving time is 38% above target. Timed practice is the highest-leverage move right now, not another concept lesson.",
      metric: '≥80% accuracy while meeting the target time per question',
      verification: 'Mini timed assessment',
      before_metrics: { accuracy: 74, speed: 55 },
      after_metrics: { accuracy: 81, speed: 70 },
    },
  },
  {
    shortLabel: 'Error repair',
    before: 73,
    after: 79,
    action: {
      type: 'ERROR_REPAIR',
      priority: 'HIGH',
      skill: 'Calculation Accuracy',
      category: 'Quantitative',
      duration: 8,
      reason: 'Your timed-practice error log shows a repeated pattern of small arithmetic slips, not conceptual mistakes.',
      why: 'Now that decision speed has improved, calculation accuracy is your next limiting factor. Repeated errors cluster around multi-digit multiplication and percentage steps — a targeted repair drill fixes that pattern directly instead of broad practice.',
      metric: 'Cut the repeated calculation-error rate by half',
      verification: 'Targeted error-pattern drill + spot check',
      before_metrics: { accuracy: 79 },
      after_metrics: { accuracy: 90 },
    },
  },
  {
    shortLabel: 'Mixed practice',
    before: 79,
    after: 81,
    action: {
      type: 'MIXED_PRACTICE',
      priority: 'MEDIUM',
      skill: 'Mixed Question Sets',
      category: 'Logical',
      duration: 10,
      reason: 'Isolated-topic performance is strong, but performance drops once topics are mixed together like the real assessment.',
      why: 'Each topic is solid on its own, but switching between question types costs time and accuracy. A short mixed mini-assessment verifies that performance holds under real conditions.',
      metric: 'Maintain ≥80% accuracy once mixed with other topics',
      verification: 'Mixed mini-assessment',
      before_metrics: { mixed_accuracy: 62 },
      after_metrics: { mixed_accuracy: 85 },
    },
  },
];

const SECONDARY_BY_STAGE = [
  [
    { skill: 'Calculation Accuracy', type: 'ERROR_REPAIR', note: '79% accuracy, recurring calculation slips' },
    { skill: 'Logical Sequences', type: 'LEARN', note: '45% concept mastery' },
  ],
  [
    { skill: 'Calculation Accuracy', type: 'ERROR_REPAIR', note: '79% accuracy, recurring calculation slips' },
    { skill: 'Verbal Reasoning', type: 'RESTORE', note: 'Dropped from 88% to 71%' },
  ],
  [
    { skill: 'Mixed Question Sets', type: 'MIXED_PRACTICE', note: '18pt gap between isolated and mixed accuracy' },
    { skill: 'Verbal Reasoning', type: 'RESTORE', note: 'Dropped from 88% to 71%' },
  ],
  [
    { skill: 'Verbal Reasoning', type: 'RESTORE', note: 'Dropped from 88% to 71%' },
    { skill: 'Logical Sequences', type: 'LEARN', note: '45% concept mastery' },
  ],
];

const MAINTAIN_BY_STAGE = [
  [{ skill: 'Arithmetic Fundamentals', note: '90% accuracy, on-pace solving' }],
  [{ skill: 'Arithmetic Fundamentals', note: '90% accuracy, on-pace solving' }],
  [
    { skill: 'Arithmetic Fundamentals', note: '90% accuracy, on-pace solving' },
    { skill: 'Data Interpretation', note: 'Concept + speed both fixed — holding at 81%' },
  ],
  [
    { skill: 'Arithmetic Fundamentals', note: '90% accuracy, on-pace solving' },
    { skill: 'Data Interpretation', note: 'Concept + speed both fixed — holding at 81%' },
    { skill: 'Calculation Accuracy', note: 'Error pattern repaired — holding at 90%' },
  ],
];

const GAP_CONTRIBUTORS_BY_STAGE = [
  [
    { skill: 'Data Interpretation', contribution: 9 },
    { skill: 'Logical Sequences', contribution: 6 },
    { skill: 'Calculation Accuracy', contribution: 4 },
  ],
  [
    { skill: 'Data Interpretation', contribution: 6 },
    { skill: 'Calculation Accuracy', contribution: 4 },
    { skill: 'Logical Sequences', contribution: 3 },
  ],
  [
    { skill: 'Calculation Accuracy', contribution: 4 },
    { skill: 'Mixed Question Sets', contribution: 3 },
  ],
  [{ skill: 'Mixed Question Sets', contribution: 2 }],
];

const GAP_EXPLANATION_BY_STAGE = [
  "Your current readiness gap is primarily caused by timed quantitative performance and a genuine concept gap in Data Interpretation — not a broad lack of preparation.",
  'Your current readiness gap is primarily caused by timed multi-step reasoning, not basic conceptual understanding — concept mastery is already strong.',
  'Your current readiness gap is primarily caused by a recurring calculation-error pattern, not a lack of speed or understanding.',
  "You're within reach of your target — the remaining gap is spread thinly across mixed-question consistency.",
];

const MILESTONES_TEMPLATE = [
  { objective: 'Close the Data Interpretation concept gap', target: 100 },
  { objective: 'Improve timed multi-step reasoning', target: 100 },
  { objective: 'Fix repeated calculation errors', target: 100 },
  { objective: 'Reach overall readiness threshold', target: 100 },
];

const TABS = [
  { id: 'action', label: 'Action Center', Icon: Activity },
  { id: 'priorities', label: 'Priorities', Icon: LayoutGrid },
  { id: 'gap', label: 'Readiness Gap', Icon: Target },
  { id: 'milestones', label: 'Milestones', Icon: Flag },
  { id: 'progress', label: 'Progress', Icon: TrendingUp },
];

const PRIORITY_COLOR = { CRITICAL: C.rose, HIGH: C.amber, MEDIUM: C.slate, LOW: C.teal };
const TARGET_READINESS = 80;

function buildPlan(minutes, step) {
  if (step >= STAGES.length) return [];
  const items = [
    { skill: STAGES[step].action.skill, type: STAGES[step].action.type, duration: STAGES[step].action.duration },
    ...SECONDARY_BY_STAGE[step].map((s) => ({ skill: s.skill, type: s.type, duration: 8 })),
  ];
  const plan = [];
  let remaining = minutes;
  for (const item of items) {
    if (item.duration <= remaining || plan.length === 0) {
      plan.push(item);
      remaining -= item.duration;
    }
    if (remaining <= 0) break;
  }
  return plan;
}

export default function ReadinessCoachingDemo() {
  const [step, setStep] = useState(0); // stages fully completed (0-4)
  const [phase, setPhase] = useState('idle'); // idle | started | completed
  const [tab, setTab] = useState('action');
  const [showWhy, setShowWhy] = useState(false);
  const [minutes, setMinutes] = useState(30);

  const clampedStep = Math.min(step, STAGES.length - 1);
  const allDone = step >= STAGES.length;
  const currentStage = STAGES[clampedStep];

  const readiness = allDone
    ? STAGES[STAGES.length - 1].after
    : phase === 'completed'
    ? currentStage.after
    : currentStage.before;

  const restart = () => {
    setStep(0);
    setPhase('idle');
    setTab('action');
    setShowWhy(false);
    setMinutes(30);
  };

  const handleStart = () => setPhase('started');
  const handleComplete = () => setPhase('completed');
  const handleContinue = () => {
    setStep((s) => s + 1);
    setPhase('idle');
    setShowWhy(false);
  };

  return (
    <div className="min-h-full w-full" style={{ backgroundColor: C.ink, color: C.ivory }}>
      <div className="max-w-3xl mx-auto px-5 py-6">
        <Header readiness={readiness} onRestart={restart} />
        <TabNav tab={tab} setTab={setTab} />

        <div className="mt-6">
          {tab === 'action' && (
            <ActionCenterTab
              allDone={allDone}
              stage={currentStage}
              phase={phase}
              showWhy={showWhy}
              setShowWhy={setShowWhy}
              onStart={handleStart}
              onComplete={handleComplete}
              onContinue={handleContinue}
              minutes={minutes}
              setMinutes={setMinutes}
              step={clampedStep}
            />
          )}
          {tab === 'priorities' && <PrioritiesTab step={clampedStep} allDone={allDone} phase={phase} />}
          {tab === 'gap' && <GapTab step={clampedStep} allDone={allDone} readiness={readiness} />}
          {tab === 'milestones' && <MilestonesTab step={step} phase={phase} />}
          {tab === 'progress' && <ProgressTab step={step} phase={phase} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Header({ readiness, onRestart }) {
  return (
    <div className="flex items-center justify-between gap-6 pb-5 border-b" style={{ borderColor: C.line }}>
      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>
          ACEAPT · Feature 07
        </p>
        <h1 className="text-xl font-semibold tracking-tight mt-1">Action Center</h1>
        <p className="text-sm mt-1" style={{ color: C.slate }}>
          Target <span className="font-mono" style={{ color: C.ivory }}>{TARGET_READINESS}%</span> readiness
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ReadinessGauge value={readiness} target={TARGET_READINESS} />
        <button
          onClick={onRestart}
          title="Restart demo"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
          style={{ color: C.slate, border: `1px solid ${C.line}` }}
        >
          <RotateCcw size={12} /> Restart
        </button>
      </div>
    </div>
  );
}

function ReadinessGauge({ value, target }) {
  const size = 72;
  const stroke = 6;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value / 100));
  const targetPct = Math.min(1, Math.max(0, target / 100));
  const angle = ((-90 + targetPct * 360) * Math.PI) / 180;
  const tIn = r - 2;
  const tOut = r + 4;
  const tx1 = cx + tIn * Math.cos(angle);
  const ty1 = cy + tIn * Math.sin(angle);
  const tx2 = cx + tOut * Math.cos(angle);
  const ty2 = cy + tOut * Math.sin(angle);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} stroke={C.line} strokeWidth={stroke} fill="none" />
        <circle
          cx={cx} cy={cy} r={r}
          stroke={C.amber} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
        />
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={C.teal} strokeWidth={2} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-semibold">{Math.round(value)}%</span>
      </div>
    </div>
  );
}

function TabNav({ tab, setTab }) {
  return (
    <nav className="flex gap-1 mt-4 overflow-x-auto">
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap"
            style={{
              color: active ? C.ivory : C.slate,
              borderBottom: `2px solid ${active ? C.amber : 'transparent'}`,
            }}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
function Badge({ children, color }) {
  return (
    <span
      className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 rounded"
      style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}66` }}
    >
      {children}
    </span>
  );
}

function ActionCenterTab({ allDone, stage, phase, showWhy, setShowWhy, onStart, onComplete, onContinue, minutes, setMinutes, step }) {
  if (allDone) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: C.panel, border: `1px solid ${C.teal}4d` }}
      >
        <Sparkles size={22} style={{ color: C.teal }} className="mx-auto mb-3" />
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: C.teal }}>
          Threshold reached
        </p>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">81% readiness</h2>
        <p className="mt-2 max-w-md mx-auto" style={{ color: C.slate }}>
          You crossed your 80% target. Concept repair, timed practice, error repair and mixed practice each closed a
          real gap — check the Progress tab for the full arc.
        </p>
      </div>
    );
  }

  const { action } = stage;
  const plan = buildPlan(minutes, step);

  return (
    <div className="space-y-5">
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <Badge color={PRIORITY_COLOR[action.priority]}>{action.priority}</Badge>
            <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: C.slate }}>
              {action.type.replace(/_/g, ' ')}
            </span>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-xs" style={{ color: C.slate }}>
            <Clock size={12} /> {action.duration} min
          </span>
        </div>

        <div className="px-5 pt-3 pb-5">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>
            Your next best action
          </p>
          <h2 className="text-xl font-semibold tracking-tight mt-1">{action.skill}</h2>
          <p className="mt-2 leading-relaxed" style={{ color: C.slate }}>{action.reason}</p>

          <button
            onClick={() => setShowWhy((s) => !s)}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium"
            style={{ color: C.amber }}
          >
            Why this? <ChevronDown size={14} style={{ transform: showWhy ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
          </button>
          {showWhy && (
            <p className="mt-2 rounded-lg p-3 text-sm leading-relaxed" style={{ backgroundColor: `${C.ink}66`, border: `1px solid ${C.line}` }}>
              {action.why}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-mono text-[9px] tracking-widest uppercase" style={{ color: C.slate }}>Success metric</p>
              <p className="mt-1">{action.metric}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-widest uppercase" style={{ color: C.slate }}>Verification</p>
              <p className="mt-1">{action.verification}</p>
            </div>
          </div>

          {phase !== 'completed' ? (
            <div className="mt-5">
              {phase === 'idle' && (
                <button
                  onClick={onStart}
                  className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold"
                  style={{ backgroundColor: C.amber, color: C.ink }}
                >
                  <Play size={14} fill="currentColor" /> Start now
                </button>
              )}
              {phase === 'started' && (
                <button
                  onClick={onComplete}
                  className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold"
                  style={{ backgroundColor: C.teal, color: C.ink }}
                >
                  <CheckCircle2 size={14} /> Mark complete
                </button>
              )}
            </div>
          ) : (
            <Outcome before={action.before_metrics} after={action.after_metrics} onNext={onContinue} />
          )}
        </div>
      </div>

      <DailyPlan minutes={minutes} setMinutes={setMinutes} plan={plan} />
    </div>
  );
}

function Outcome({ before, after, onNext }) {
  const keys = Object.keys(after).filter((k) => before[k] !== undefined);
  return (
    <div className="mt-5 rounded-lg p-4" style={{ backgroundColor: `${C.teal}0d`, border: `1px solid ${C.teal}4d` }}>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.teal }}>Completed</p>
      <div className="mt-2 flex flex-wrap gap-5">
        {keys.map((k) => (
          <div key={k}>
            <p className="font-mono text-[9px] tracking-widest uppercase" style={{ color: C.slate }}>{k.replace(/_/g, ' ')}</p>
            <p className="font-mono text-base mt-0.5">
              {before[k]} → <span style={{ color: C.teal, fontWeight: 600 }}>{after[k]}</span>
            </p>
          </div>
        ))}
      </div>
      <button onClick={onNext} className="mt-3 text-sm font-medium" style={{ color: C.amber }}>
        See your next best action →
      </button>
    </div>
  );
}

function DailyPlan({ minutes, setMinutes, plan }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>
          Today's plan, if you have
        </p>
        <div className="flex gap-1.5">
          {[10, 20, 30, 45, 60].map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className="rounded-md px-2.5 py-1 font-mono text-xs"
              style={
                minutes === m
                  ? { backgroundColor: C.amber, color: C.ink, fontWeight: 600 }
                  : { backgroundColor: C.panel2, color: C.slate }
              }
            >
              {m}m
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {plan.map((item, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-lg px-3 py-2.5"
            style={{ backgroundColor: `${C.ink}4d`, border: `1px solid ${C.line}` }}
          >
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs w-5" style={{ color: C.slate }}>{String(i + 1).padStart(2, '0')}</span>
              <span className="text-sm">{item.skill}</span>
              <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: C.slate }}>
                {item.type.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="font-mono text-xs" style={{ color: C.slate }}>{item.duration}m</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PrioritiesTab({ step, allDone, phase }) {
  const top = allDone ? [] : [{ ...STAGES[step].action, details: STAGES[step].action.reason }];
  const secondary = allDone ? [] : SECONDARY_BY_STAGE[step];
  const maintain = MAINTAIN_BY_STAGE[Math.min(step, MAINTAIN_BY_STAGE.length - 1)];

  const columns = [
    { key: 'top', label: 'Top priority', color: C.rose, items: top },
    { key: 'secondary', label: 'Secondary', color: C.amber, items: secondary },
    { key: 'maintain', label: 'Maintain', color: C.teal, items: maintain },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {columns.map((col) => (
        <div key={col.key} className="rounded-xl p-4" style={{ backgroundColor: C.panel, border: `1px solid ${col.color}4d` }}>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: col.color }}>{col.label}</p>
          <div className="mt-3 space-y-2.5">
            {col.items.length === 0 && <p className="text-sm" style={{ color: C.slate }}>Nothing here right now.</p>}
            {col.items.map((item, i) => (
              <div key={i} className="rounded-lg p-3" style={{ backgroundColor: `${C.ink}4d`, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.skill}</span>
                </div>
                <p className="mt-1 font-mono text-[9px] tracking-widest uppercase" style={{ color: C.slate }}>
                  {(item.type || '').toString().replace(/_/g, ' ')}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: C.slate }}>
                  {item.note || item.details}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function GapTab({ step, allDone, readiness }) {
  const target = TARGET_READINESS;
  const gap = Math.max(0, target - readiness);
  const contributors = allDone ? [] : GAP_CONTRIBUTORS_BY_STAGE[step];
  const explanation = allDone
    ? "You've closed the gap — readiness is now above your 80% target."
    : GAP_EXPLANATION_BY_STAGE[step];
  const maxContribution = Math.max(1, ...contributors.map((c) => c.contribution));

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>Current</p>
          <p className="font-mono text-2xl font-semibold mt-1">{readiness}%</p>
        </div>
        <span style={{ color: C.slate }}>→</span>
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>Target</p>
          <p className="font-mono text-2xl font-semibold mt-1" style={{ color: C.teal }}>{target}%</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>Gap</p>
          <p className="font-mono text-2xl font-semibold mt-1" style={{ color: C.amber }}>{gap}pt</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed pt-4" style={{ borderTop: `1px solid ${C.line}` }}>{explanation}</p>

      {contributors.length > 0 && (
        <>
          <p className="mt-5 font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>Main contributors</p>
          <div className="mt-3 space-y-3">
            {contributors.map((c) => (
              <div key={c.skill}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{c.skill}</span>
                  <span className="font-mono" style={{ color: C.slate }}>{c.contribution}pt</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${C.ink}99` }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(c.contribution / maxContribution) * 100}%`, backgroundColor: C.amber, transition: 'width 500ms' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function MilestonesTab({ step, phase }) {
  const items = MILESTONES_TEMPLATE.map((m, i) => {
    let status = 'PENDING';
    let progress = 0;
    if (i < step) {
      status = 'COMPLETE';
      progress = m.target;
    } else if (i === step) {
      if (phase === 'completed') {
        status = 'COMPLETE';
        progress = m.target;
      } else if (phase === 'started') {
        status = 'IN_PROGRESS';
        progress = Math.round(m.target * 0.55);
      } else {
        status = 'IN_PROGRESS';
        progress = Math.round(m.target * 0.25);
      }
    }
    return { ...m, status, progress };
  });

  const ICONS = { COMPLETE: CheckCircle2, IN_PROGRESS: CircleDot, PENDING: Circle };
  const COLORS = { COMPLETE: C.teal, IN_PROGRESS: C.amber, PENDING: C.slate };

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase mb-4" style={{ color: C.slate }}>Milestones</p>
      <ol className="space-y-4">
        {items.map((m, i) => {
          const Icon = ICONS[m.status];
          const pct = (m.progress / m.target) * 100;
          return (
            <li key={i} className="flex gap-3">
              <Icon size={18} style={{ color: COLORS[m.status], marginTop: 2, flexShrink: 0 }} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="text-sm font-medium"
                    style={m.status === 'COMPLETE' ? { color: C.slate, textDecoration: 'line-through' } : {}}
                  >
                    {m.objective}
                  </span>
                  <span className="font-mono text-xs shrink-0" style={{ color: C.slate }}>{Math.round(pct)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${C.ink}99` }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: COLORS[m.status], transition: 'width 500ms' }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProgressTab({ step, phase }) {
  const completedStages = phase === 'completed' ? step + 1 : step;
  const data = [
    { label: 'Start', readiness: STAGES[0].before },
    ...STAGES.slice(0, completedStages).map((s) => ({ label: s.shortLabel, readiness: s.after })),
  ];

  if (data.length < 2) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}`, color: C.slate }}>
        Complete an action in the Action Center to start building your progress story.
      </div>
    );
  }

  const before = data[0];
  const after = data[data.length - 1];

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: C.slate }}>
          Readiness over time
        </p>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 10, left: -24, bottom: 8 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.slate, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: C.slate, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} width={32} />
              <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.ivory }} />
              <Line type="monotone" dataKey="readiness" stroke={C.amber} strokeWidth={2.5} dot={{ fill: C.amber, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ backgroundColor: C.panel, border: `1px solid ${C.line}` }}>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.slate }}>Before</p>
          <p className="font-mono text-2xl font-semibold mt-1.5">{before.readiness}%</p>
        </div>
        <div className="rounded-xl p-5" style={{ backgroundColor: `${C.teal}0d`, border: `1px solid ${C.teal}4d` }}>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.teal }}>After</p>
          <p className="font-mono text-2xl font-semibold mt-1.5" style={{ color: C.teal }}>{after.readiness}%</p>
        </div>
      </div>
    </div>
  );
}
