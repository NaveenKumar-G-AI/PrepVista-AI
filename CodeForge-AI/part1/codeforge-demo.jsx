import { useState, useEffect, Fragment } from 'react';
import { Search, ArrowLeft, Check, RotateCcw, ArrowLeftRight, Clock, X } from 'lucide-react';

/* ------------------------------------------------------------------
   Design tokens. Signature element: a small "rail" of connected nodes,
   grounded in the subject itself (a taxonomy graph) — reused for the
   domain/family/role breadcrumb, the proficiency ladder, and a
   target-change transition. See docs/ARCHITECTURE_AND_RESEARCH.md for
   the fuller design rationale in the companion project.
------------------------------------------------------------------- */
const C = {
  bg: '#F5F7F4',
  surface: '#FFFFFF',
  border: '#DCE2DD',
  borderStrong: '#B9C4BC',
  ink: '#17211C',
  inkMuted: '#55635C',
  inkFaint: '#8A948D',
  accent: '#1E5F59',
  accentStrong: '#123936',
  accentSoft: '#E4EFEC',
  core: '#8A5A22',
  coreSoft: '#F3E8DA',
  warnSoft: '#F5E7E4',
  warn: '#8B4A3E',
};

const FONT_SANS = "'IBM Plex Sans', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";

/* ------------------------------------------------------------------
   Seed content — mirrors src/seed/data.ts in the companion backend
   project (same 10 roles, same competency groupings). This artifact
   runs entirely client-side, so it carries its own copy rather than
   calling the API (see docs/FINAL_REPORT.md §6 for why).
------------------------------------------------------------------- */
const FAMILIES = {
  'software-development': { name: 'Software Development', domain: 'Software & Technology' },
  'cloud-infrastructure': { name: 'Cloud & Infrastructure', domain: 'Software & Technology' },
  'ai-machine-learning': { name: 'AI & Machine Learning', domain: 'Data & Artificial Intelligence' },
  'data-analytics': { name: 'Data & Analytics', domain: 'Data & Artificial Intelligence' },
};

const PROFICIENCY_LEVELS = ['Foundation', 'Developing', 'Competent', 'Strong', 'Advanced'];

const ROLES = [
  {
    slug: 'software-engineer',
    name: 'Software Engineer',
    family: 'software-development',
    oneLiner: 'Designs, builds, and maintains software across the stack.',
    whatYouWorkOn:
      'A generalist engineering role focused on turning requirements into working, tested software — writing code, fixing defects, and collaborating with a team, without being tied to one layer of the stack.',
    core: ['Programming', 'Problem Solving', 'Data Structures & Algorithms', 'Debugging', 'Testing & Quality Engineering'],
    important: ['Databases', 'API Design & Integration', 'Software Architecture & System Design'],
    supporting: ['Version Control & Collaboration', 'Engineering Communication'],
    commonTech: ['Python', 'Java', 'JavaScript', 'Git'],
    supportingTech: ['SQL', 'TypeScript'],
    progression: 'Core programming and problem-solving competencies target Competent, with room to grow toward Strong in system design as you gain experience.',
  },
  {
    slug: 'backend-engineer',
    name: 'Backend Engineer',
    family: 'software-development',
    oneLiner: 'Builds the servers, APIs, and data layer behind an application.',
    whatYouWorkOn:
      'Focuses on the server side of an application: modeling data, exposing it through reliable APIs, and keeping the backend correct and reasonably fast as usage grows.',
    core: ['Programming', 'Databases', 'API Design & Integration', 'Data Structures & Algorithms'],
    important: ['Software Architecture & System Design', 'Testing & Quality Engineering', 'Cloud Infrastructure & Operations'],
    supporting: ['Debugging', 'Version Control & Collaboration'],
    commonTech: ['Python', 'Java', 'TypeScript', 'PostgreSQL', 'SQL'],
    supportingTech: ['Docker', 'MongoDB', 'AWS'],
    progression: 'Core data and API competencies target Competent; architecture and testing follow close behind at Developing to Competent.',
  },
  {
    slug: 'frontend-engineer',
    name: 'Frontend Engineer',
    family: 'software-development',
    oneLiner: 'Builds the interface a user actually sees and interacts with.',
    whatYouWorkOn:
      'Turns designs and requirements into interfaces that are correct, responsive, and usable — working mainly in the browser and consuming backend APIs rather than building them.',
    core: ['Programming', 'UI/UX Implementation', 'Problem Solving'],
    important: ['API Design & Integration', 'Testing & Quality Engineering', 'Debugging'],
    supporting: ['Data Structures & Algorithms', 'Version Control & Collaboration'],
    commonTech: ['JavaScript', 'TypeScript', 'React', 'HTML & CSS'],
    supportingTech: ['Node.js'],
    progression: 'Interface and programming competencies target Competent; API consumption and testing sit at Developing while you build fluency.',
  },
  {
    slug: 'full-stack-engineer',
    name: 'Full Stack Engineer',
    family: 'software-development',
    oneLiner: 'Works across both the interface and the server that powers it.',
    whatYouWorkOn:
      'Moves between frontend and backend work on the same product — building an interface, the API behind it, and the data it reads and writes.',
    core: ['Programming', 'API Design & Integration', 'Databases', 'UI/UX Implementation'],
    important: ['Data Structures & Algorithms', 'Software Architecture & System Design', 'Testing & Quality Engineering'],
    supporting: ['Debugging', 'Cloud Infrastructure & Operations', 'Version Control & Collaboration'],
    commonTech: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'PostgreSQL'],
    supportingTech: ['Python', 'Docker'],
    progression: 'Programming, APIs, data, and UI all target Competent — breadth across the stack matters more here than depth in any one layer.',
  },
  {
    slug: 'ai-ml-engineer',
    name: 'AI / ML Engineer',
    family: 'ai-machine-learning',
    oneLiner: 'Builds and ships systems powered by machine learning models.',
    whatYouWorkOn:
      'Takes models from a working prototype to something usable in a real application — training, evaluating, and integrating machine learning components into software.',
    core: ['Programming', 'Machine Learning', 'Data Structures & Algorithms', 'Statistics & Probability'],
    important: ['Data Analysis & Manipulation', 'Software Architecture & System Design', 'Databases'],
    supporting: ['Testing & Quality Engineering', 'Cloud Infrastructure & Operations', 'Debugging'],
    commonTech: ['Python', 'scikit-learn', 'TensorFlow'],
    supportingTech: ['SQL', 'Docker', 'AWS'],
    progression: 'Machine learning, programming, and statistics all target Competent; production-readiness competencies like architecture sit at Developing.',
  },
  {
    slug: 'data-scientist',
    name: 'Data Scientist',
    family: 'data-analytics',
    oneLiner: 'Uses statistics and modeling to answer open-ended questions from data.',
    whatYouWorkOn:
      'Explores data to find patterns, tests hypotheses rigorously, and builds models — aiming to produce an insight or recommendation, not necessarily to ship production code.',
    core: ['Statistics & Probability', 'Data Analysis & Manipulation', 'Machine Learning'],
    important: ['Business & Stakeholder Interpretation', 'Programming', 'Databases'],
    supporting: ['Data Engineering', 'Engineering Communication'],
    commonTech: ['Python', 'R', 'SQL', 'Pandas', 'Jupyter Notebook'],
    supportingTech: ['scikit-learn', 'Tableau'],
    progression: 'Statistics and data analysis target Competent; modeling and communicating findings follow at Developing to Competent.',
  },
  {
    slug: 'data-analyst',
    name: 'Data Analyst',
    family: 'data-analytics',
    oneLiner: 'Turns raw data into reports and answers business questions.',
    whatYouWorkOn:
      'Works closely with SQL and dashboards to answer concrete business questions — less focused on building predictive models, more on describing what happened and why.',
    core: ['Data Analysis & Manipulation', 'Statistics & Probability', 'Business & Stakeholder Interpretation'],
    important: ['Databases', 'Engineering Communication'],
    supporting: ['Programming', 'Machine Learning'],
    commonTech: ['SQL', 'Tableau'],
    supportingTech: ['Python', 'Pandas'],
    progression: 'Data analysis and stakeholder interpretation target Competent; SQL fluency matters most, with programming as a supporting, foundation-level skill.',
  },
  {
    slug: 'data-engineer',
    name: 'Data Engineer',
    family: 'data-analytics',
    oneLiner: 'Builds the pipelines that move and prepare data reliably.',
    whatYouWorkOn:
      'Builds and operates the infrastructure that gets data from where it is produced to where analysts, scientists, and applications can use it, with a focus on reliability at scale.',
    core: ['Data Engineering', 'Databases', 'Programming'],
    important: ['Data Structures & Algorithms', 'Software Architecture & System Design', 'Cloud Infrastructure & Operations'],
    supporting: ['Testing & Quality Engineering', 'Data Analysis & Manipulation'],
    commonTech: ['Python', 'SQL', 'Apache Spark', 'Apache Airflow'],
    supportingTech: ['AWS', 'PostgreSQL', 'Docker'],
    progression: 'Pipeline design and databases target Competent; cloud and architecture competencies follow at Developing.',
  },
  {
    slug: 'qa-sdet',
    name: 'QA / SDET',
    family: 'software-development',
    oneLiner: 'Builds confidence that software works, and automates that check.',
    whatYouWorkOn:
      'Focuses on finding what is broken before a user does — through manual exploration and, increasingly, by writing automated tests and tooling that make quality checks repeatable.',
    core: ['Testing & Quality Engineering', 'Debugging', 'Problem Solving'],
    important: ['Programming', 'API Design & Integration', 'Data Structures & Algorithms'],
    supporting: ['Version Control & Collaboration', 'Cloud Infrastructure & Operations'],
    commonTech: ['Python', 'Java', 'Git'],
    supportingTech: ['SQL', 'Docker'],
    progression: 'Testing, debugging, and problem solving target Competent; automation-focused programming sits at Developing to Competent.',
  },
  {
    slug: 'devops-cloud-engineer',
    name: 'DevOps / Cloud Engineer',
    family: 'cloud-infrastructure',
    oneLiner: 'Builds and operates the platform other engineers ship on top of.',
    whatYouWorkOn:
      'Automates how software gets built, deployed, and kept running — provisioning infrastructure, building deployment pipelines, and responding when something in production breaks.',
    core: ['Cloud Infrastructure & Operations', 'Programming', 'Software Architecture & System Design'],
    important: ['Databases', 'Testing & Quality Engineering', 'Debugging'],
    supporting: ['Data Structures & Algorithms', 'Version Control & Collaboration'],
    commonTech: ['Docker', 'Kubernetes', 'AWS', 'Git'],
    supportingTech: ['Python', 'SQL'],
    progression: 'Infrastructure and operations competencies target Competent; supporting programming and architecture sit at Developing as you build breadth.',
  },
];

const TOP_PROFICIENCY_INDEX = 2; // "Competent" — the dominant target across this catalog (see docs)

function getRole(slug) {
  return ROLES.find((r) => r.slug === slug) || null;
}

function allCompetencies(role) {
  return [...role.core, ...role.important, ...role.supporting];
}
function allTech(role) {
  return [...role.commonTech, ...role.supportingTech];
}

function searchRoles(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = ROLES.map((role) => {
    const name = role.name.toLowerCase();
    let score = 0;
    if (name === q) score = Math.max(score, 100);
    if (role.slug === q.replace(/\s+/g, '-')) score = Math.max(score, 95);
    if (name.startsWith(q)) score = Math.max(score, 80);
    if (name.includes(q)) score = Math.max(score, 60);
    if (FAMILIES[role.family].name.toLowerCase().includes(q)) score = Math.max(score, 45);
    if (allCompetencies(role).some((c) => c.toLowerCase().includes(q))) score = Math.max(score, 35);
    if (allTech(role).some((t) => t.toLowerCase().includes(q))) score = Math.max(score, 30);
    if (role.oneLiner.toLowerCase().includes(q) || role.whatYouWorkOn.toLowerCase().includes(q)) score = Math.max(score, 15);
    return { role, score };
  }).filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score || a.role.name.localeCompare(b.role.name));
  return scored.map((r) => r.role);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------
   Persistent storage (personal — this student's target is not shared
   with other users of the artifact). Context + history are updated
   together, so they live under one key.
------------------------------------------------------------------- */
const STORAGE_KEY = 'career-data';
const EMPTY_DATA = { context: null, history: [] };

async function loadCareerData() {
  try {
    const result = await window.storage.get(STORAGE_KEY, false);
    return result ? JSON.parse(result.value) : EMPTY_DATA;
  } catch {
    return EMPTY_DATA;
  }
}
async function saveCareerData(data) {
  try {
    const result = await window.storage.set(STORAGE_KEY, JSON.stringify(data), false);
    return Boolean(result);
  } catch {
    return false;
  }
}
async function clearCareerData() {
  try {
    await window.storage.delete(STORAGE_KEY, false);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------
   Small building blocks
------------------------------------------------------------------- */

function Rail({ items, activeIndex, dense }) {
  return (
    <div className="flex items-center flex-wrap" style={{ rowGap: 6 }}>
      {items.map((label, i) => (
        <Fragment key={label + i}>
          {i > 0 && (
            <div
              aria-hidden="true"
              style={{ width: dense ? 14 : 22, height: 1, background: i <= activeIndex ? C.accent : C.border, flexShrink: 0 }}
            />
          )}
          <div className="flex items-center" style={{ gap: 6 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: 2,
                background: i <= activeIndex ? C.accent : C.surface,
                border: `1px solid ${i <= activeIndex ? C.accent : C.borderStrong}`,
                flexShrink: 0,
              }}
            />
            <span
              className={dense ? 'text-[11px]' : 'text-xs'}
              style={{
                fontFamily: FONT_MONO,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: i <= activeIndex ? C.ink : C.inkFaint,
                fontWeight: i === activeIndex ? 600 : 500,
              }}
            >
              {label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function Tag({ tone, children }) {
  const styles = {
    core: { bg: C.coreSoft, fg: C.core },
    neutral: { bg: C.accentSoft, fg: C.accentStrong },
    faint: { bg: C.bg, fg: C.inkMuted },
  }[tone];
  return (
    <span
      className="inline-block px-2 py-1 text-xs rounded"
      style={{ background: styles.bg, color: styles.fg, fontFamily: FONT_SANS, fontWeight: 500, border: `1px solid ${C.border}` }}
    >
      {children}
    </span>
  );
}

function TechChip({ children, muted }) {
  return (
    <span
      className="inline-block px-2 py-1 text-xs rounded"
      style={{
        fontFamily: FONT_MONO,
        color: muted ? C.inkMuted : C.ink,
        background: C.surface,
        border: `1px solid ${muted ? C.border : C.borderStrong}`,
      }}
    >
      {children}
    </span>
  );
}

function PrimaryButton({ children, onClick, icon: Icon, fullWidth }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 ${fullWidth ? 'w-full' : ''}`}
      style={{ background: C.accent, color: '#FFFFFF', fontFamily: FONT_SANS, fontWeight: 600 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.accentStrong)}
      onMouseLeave={(e) => (e.currentTarget.style.background = C.accent)}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
      style={{ background: C.surface, color: C.ink, fontFamily: FONT_SANS, fontWeight: 600, border: `1px solid ${C.borderStrong}` }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function RoleCard({ role, isTarget, onOpen }) {
  return (
    <button
      onClick={() => onOpen(role.slug)}
      className="text-left w-full p-4 rounded transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
      style={{ background: C.surface, border: `1px solid ${isTarget ? C.accent : C.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base" style={{ fontFamily: FONT_SANS, fontWeight: 600, color: C.ink }}>
          {role.name}
        </h3>
        {isTarget && (
          <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: C.accent, fontFamily: FONT_MONO }}>
            <Check size={13} /> TARGET
          </span>
        )}
      </div>
      <p className="text-sm mt-1" style={{ color: C.inkMuted, fontFamily: FONT_SANS }}>
        {role.oneLiner}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {role.core.slice(0, 4).map((c) => (
          <TechChip key={c} muted>
            {c}
          </TechChip>
        ))}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------
   Main app
------------------------------------------------------------------- */

export default function CodeForgeRoleContext() {
  const [loading, setLoading] = useState(true);
  const [careerData, setCareerData] = useState(EMPTY_DATA);
  const [saveError, setSaveError] = useState(false);

  const [view, setView] = useState('home'); // home | detail | compare | confirm | history
  const [query, setQuery] = useState('');
  const [activeFamily, setActiveFamily] = useState(null);
  const [detailSlug, setDetailSlug] = useState(null);
  const [compareA, setCompareA] = useState('software-engineer');
  const [compareB, setCompareB] = useState('ai-ml-engineer');
  const [changeFrom, setChangeFrom] = useState(null);
  const [resetConfirming, setResetConfirming] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadCareerData().then((data) => {
      if (mounted) {
        setCareerData(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const currentSlug = careerData.context?.slug ?? null;

  async function persist(next) {
    const previous = careerData;
    setCareerData(next); // optimistic
    const ok = await saveCareerData(next);
    if (!ok) {
      setCareerData(previous); // Step 60: never show a state that didn't actually save
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
      return false;
    }
    return true;
  }

  async function handleSelect(slug) {
    const role = getRole(slug);
    if (!role) return;
    const now = new Date().toISOString();
    const previousSlug = currentSlug;

    if (previousSlug === slug) {
      // Idempotent: re-selecting the current target is a no-op, not a new transition.
      setChangeFrom(null);
      setView('confirm');
      return;
    }

    let history = careerData.history.map((h) => (h.endedAt === null ? { ...h, endedAt: now } : h));
    history = [...history, { slug, name: role.name, startedAt: now, endedAt: null }];
    const context = { slug, name: role.name, selectedAt: now };

    const ok = await persist({ context, history });
    if (ok) {
      setChangeFrom(previousSlug ? getRole(previousSlug)?.name ?? null : null);
      setView('confirm');
    }
  }

  async function handleReset() {
    await clearCareerData();
    setCareerData(EMPTY_DATA);
    setResetConfirming(false);
    setView('home');
  }

  function openDetail(slug) {
    setDetailSlug(slug);
    setView('detail');
  }

  const results = query ? searchRoles(query) : activeFamily ? ROLES.filter((r) => r.family === activeFamily) : ROLES;
  const groupedByFamily = Object.keys(FAMILIES).map((fam) => ({
    fam,
    roles: results.filter((r) => r.family === fam),
  }));

  return (
    <div className="min-h-screen" style={{ background: C.bg, fontFamily: FONT_SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      `}</style>

      {/* Top bar */}
      <header className="border-b sticky top-0 z-10" style={{ background: C.bg, borderColor: C.border }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setView('home');
              setQuery('');
              setActiveFamily(null);
            }}
            className="text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded"
            style={{ fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: '0.04em', color: C.ink }}
          >
            CODEFORGE <span style={{ color: C.inkFaint }}>/ ROLE CONTEXT</span>
          </button>
          <div className="flex items-center gap-2">
            {careerData.context && (
              <button
                onClick={() => openDetail(careerData.context.slug)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                style={{ background: C.accentSoft, color: C.accentStrong, fontFamily: FONT_MONO, border: `1px solid ${C.accent}` }}
              >
                <Check size={12} /> {careerData.context.name}
              </button>
            )}
            <button
              onClick={() => setView('history')}
              aria-label="View target history"
              className="p-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              style={{ color: C.inkMuted }}
            >
              <Clock size={17} />
            </button>
            {careerData.context && (
              <button
                onClick={() => setResetConfirming(true)}
                aria-label="Reset saved target and history"
                className="p-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                style={{ color: C.inkMuted }}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {saveError && (
          <div className="mb-4 px-3 py-2 rounded text-sm" style={{ background: C.warnSoft, color: C.warn, fontFamily: FONT_SANS }}>
            Couldn't save that change. Your previous target is still shown — try again in a moment.
          </div>
        )}

        {resetConfirming && (
          <div className="mb-6 p-4 rounded" style={{ background: C.warnSoft, border: `1px solid ${C.warn}` }}>
            <p className="text-sm" style={{ color: C.ink, fontFamily: FONT_SANS }}>
              Reset your saved target and history? This clears what's stored in this artifact and can't be undone.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                style={{ background: C.warn, color: '#fff', fontFamily: FONT_SANS, fontWeight: 600 }}
              >
                Yes, reset
              </button>
              <button
                onClick={() => setResetConfirming(false)}
                className="px-3 py-1.5 text-xs rounded flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                style={{ background: C.surface, border: `1px solid ${C.borderStrong}`, fontFamily: FONT_SANS }}
              >
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: C.inkMuted }}>
            Loading your target…
          </p>
        ) : view === 'home' ? (
          <HomeView
            careerData={careerData}
            query={query}
            setQuery={setQuery}
            activeFamily={activeFamily}
            setActiveFamily={setActiveFamily}
            groupedByFamily={groupedByFamily}
            results={results}
            currentSlug={currentSlug}
            openDetail={openDetail}
          />
        ) : view === 'detail' ? (
          <DetailView
            role={getRole(detailSlug)}
            isTarget={detailSlug === currentSlug}
            onBack={() => setView('home')}
            onSelect={() => handleSelect(detailSlug)}
            onCompare={() => {
              setCompareA(detailSlug);
              setCompareB(ROLES.find((r) => r.slug !== detailSlug)?.slug ?? detailSlug);
              setView('compare');
            }}
          />
        ) : view === 'compare' ? (
          <CompareView
            aSlug={compareA}
            bSlug={compareB}
            setASlug={setCompareA}
            setBSlug={setCompareB}
            onBack={() => setView('home')}
            onOpen={openDetail}
          />
        ) : view === 'confirm' ? (
          <ConfirmView
            role={getRole(currentSlug)}
            changeFrom={changeFrom}
            onViewDetail={() => openDetail(currentSlug)}
            onExplore={() => setView('home')}
            onHistory={() => setView('history')}
          />
        ) : (
          <HistoryView history={careerData.history} onBack={() => setView('home')} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------
   Views
------------------------------------------------------------------- */

function HomeView({ careerData, query, setQuery, activeFamily, setActiveFamily, groupedByFamily, results, currentSlug, openDetail }) {
  return (
    <div>
      {careerData.context && (
        <div className="mb-6 p-4 rounded" style={{ background: C.surface, border: `1px solid ${C.accent}` }}>
          <p className="text-xs uppercase" style={{ fontFamily: FONT_MONO, color: C.accent, letterSpacing: '0.06em' }}>
            Your target
          </p>
          <button
            onClick={() => openDetail(careerData.context.slug)}
            className="text-lg mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded"
            style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.ink }}
          >
            {careerData.context.name}
          </button>
        </div>
      )}

      <h1 className="text-2xl mb-4" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.ink }}>
        What are you preparing for?
      </h1>

      <label htmlFor="role-search" className="sr-only">
        Search technical roles
      </label>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.inkFaint }} />
        <input
          id="role-search"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveFamily(null);
          }}
          placeholder="Search roles, e.g. backend, python, testing…"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          style={{ background: C.surface, border: `1px solid ${C.borderStrong}`, color: C.ink, fontFamily: FONT_MONO }}
        />
      </div>

      {!query && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveFamily(null)}
            className="px-3 py-1.5 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            style={{
              fontFamily: FONT_MONO,
              background: activeFamily === null ? C.accent : C.surface,
              color: activeFamily === null ? '#fff' : C.inkMuted,
              border: `1px solid ${activeFamily === null ? C.accent : C.border}`,
            }}
          >
            ALL
          </button>
          {Object.entries(FAMILIES).map(([slug, f]) => (
            <button
              key={slug}
              onClick={() => setActiveFamily(slug)}
              className="px-3 py-1.5 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              style={{
                fontFamily: FONT_MONO,
                background: activeFamily === slug ? C.accent : C.surface,
                color: activeFamily === slug ? '#fff' : C.inkMuted,
                border: `1px solid ${activeFamily === slug ? C.accent : C.border}`,
              }}
            >
              {f.name.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {query ? (
        results.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: C.inkMuted }}>
            No roles match "{query}". Try a broader term, like a technology or "testing".
          </p>
        ) : (
          <div className="grid gap-3">
            {results.map((role) => (
              <RoleCard key={role.slug} role={role} isTarget={role.slug === currentSlug} onOpen={openDetail} />
            ))}
          </div>
        )
      ) : (
        groupedByFamily
          .filter((g) => g.roles.length > 0)
          .map((g) => (
            <section key={g.fam} className="mb-7">
              <h2
                className="text-xs uppercase mb-3"
                style={{ fontFamily: FONT_MONO, color: C.inkFaint, letterSpacing: '0.08em' }}
              >
                § {FAMILIES[g.fam].name}
              </h2>
              <div className="grid gap-3">
                {g.roles.map((role) => (
                  <RoleCard key={role.slug} role={role} isTarget={role.slug === currentSlug} onOpen={openDetail} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

function DetailView({ role, isTarget, onBack, onSelect, onCompare }) {
  if (!role) return null;
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded"
        style={{ color: C.inkMuted, fontFamily: FONT_SANS }}
      >
        <ArrowLeft size={15} /> Back
      </button>

      <div className="mb-4">
        <Rail items={[FAMILIES[role.family].domain, FAMILIES[role.family].name, role.name]} activeIndex={2} dense />
      </div>

      <h1 className="text-2xl mb-2" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.ink }}>
        {role.name}
      </h1>
      <p className="text-sm mb-6" style={{ color: C.inkMuted }}>
        {role.oneLiner}
      </p>

      <SectionLabel>What you'll work on</SectionLabel>
      <p className="text-sm mb-6" style={{ color: C.ink, lineHeight: 1.6 }}>
        {role.whatYouWorkOn}
      </p>

      <SectionLabel>Core competencies</SectionLabel>
      <div className="flex flex-wrap gap-2 mb-5">
        {role.core.map((c) => (
          <Tag key={c} tone="core">
            {c}
          </Tag>
        ))}
      </div>

      <SectionLabel>Important</SectionLabel>
      <div className="flex flex-wrap gap-2 mb-5">
        {role.important.map((c) => (
          <Tag key={c} tone="neutral">
            {c}
          </Tag>
        ))}
      </div>

      <SectionLabel>Supporting</SectionLabel>
      <div className="flex flex-wrap gap-2 mb-6">
        {role.supporting.map((c) => (
          <Tag key={c} tone="faint">
            {c}
          </Tag>
        ))}
      </div>

      <SectionLabel>Common languages & tools</SectionLabel>
      <div className="flex flex-wrap gap-2 mb-2">
        {role.commonTech.map((t) => (
          <TechChip key={t}>{t}</TechChip>
        ))}
        {role.supportingTech.map((t) => (
          <TechChip key={t} muted>
            {t}
          </TechChip>
        ))}
      </div>
      <p className="text-xs mb-6" style={{ color: C.inkFaint }}>
        Faint chips are supporting technologies — useful, not required to get started.
      </p>

      <SectionLabel>Expected capability progression</SectionLabel>
      <div className="mb-2">
        <Rail items={PROFICIENCY_LEVELS} activeIndex={2} />
      </div>
      <p className="text-sm mb-8" style={{ color: C.inkMuted, lineHeight: 1.6 }}>
        {role.progression}
      </p>

      <div className="flex flex-wrap gap-3">
        {isTarget ? (
          <span
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm rounded"
            style={{ background: C.accentSoft, color: C.accentStrong, fontFamily: FONT_SANS, fontWeight: 600 }}
          >
            <Check size={16} /> This is your current target
          </span>
        ) : (
          <PrimaryButton onClick={onSelect} icon={Check}>
            Select this role
          </PrimaryButton>
        )}
        <SecondaryButton onClick={onCompare} icon={ArrowLeftRight}>
          Compare with another role
        </SecondaryButton>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h2 className="text-xs uppercase mb-2" style={{ fontFamily: FONT_MONO, color: C.inkFaint, letterSpacing: '0.08em' }}>
      {children}
    </h2>
  );
}

function tierOf(role, competencyName) {
  if (role.core.includes(competencyName)) return 'core';
  if (role.important.includes(competencyName)) return 'important';
  if (role.supporting.includes(competencyName)) return 'supporting';
  return null;
}
function techTierOf(role, techName) {
  if (role.commonTech.includes(techName)) return 'common';
  if (role.supportingTech.includes(techName)) return 'supporting';
  return null;
}

function TierMark({ tier }) {
  if (!tier) return <span style={{ color: C.inkFaint }}>—</span>;
  const label = { core: 'Core', important: 'Important', supporting: 'Supporting', common: 'Common' }[tier];
  const color = tier === 'core' || tier === 'common' ? C.core : tier === 'important' ? C.accent : C.inkMuted;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ fontFamily: FONT_MONO, color }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function CompareView({ aSlug, bSlug, setASlug, setBSlug, onBack, onOpen }) {
  const a = getRole(aSlug);
  const b = getRole(bSlug);
  if (!a || !b) return null;

  const competencyNames = [...new Set([...allCompetencies(a), ...allCompetencies(b)])].sort((x, y) => {
    const sharedX = tierOf(a, x) && tierOf(b, x);
    const sharedY = tierOf(a, y) && tierOf(b, y);
    if (sharedX !== sharedY) return sharedX ? -1 : 1;
    return x.localeCompare(y);
  });
  const techNames = [...new Set([...allTech(a), ...allTech(b)])].sort((x, y) => {
    const sharedX = techTierOf(a, x) && techTierOf(b, x);
    const sharedY = techTierOf(a, y) && techTierOf(b, y);
    if (sharedX !== sharedY) return sharedX ? -1 : 1;
    return x.localeCompare(y);
  });

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded"
        style={{ color: C.inkMuted }}
      >
        <ArrowLeft size={15} /> Back
      </button>

      <h1 className="text-2xl mb-5" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.ink }}>
        Compare roles
      </h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <RoleSelect label="Role A" value={aSlug} onChange={setASlug} />
        <RoleSelect label="Role B" value={bSlug} onChange={setBSlug} />
      </div>

      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: C.inkMuted, fontFamily: FONT_MONO, fontSize: 11 }}>
                COMPETENCY
              </th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: C.ink, fontFamily: FONT_SANS }}>
                <button onClick={() => onOpen(a.slug)} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded">
                  {a.name}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: C.ink, fontFamily: FONT_SANS }}>
                <button onClick={() => onOpen(b.slug)} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded">
                  {b.name}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {competencyNames.map((name, i) => (
              <tr key={name} style={{ background: i % 2 === 0 ? C.surface : C.bg, borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2" style={{ color: C.ink }}>
                  {name}
                </td>
                <td className="px-3 py-2">
                  <TierMark tier={tierOf(a, name)} />
                </td>
                <td className="px-3 py-2">
                  <TierMark tier={tierOf(b, name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xs uppercase mt-6 mb-2" style={{ fontFamily: FONT_MONO, color: C.inkFaint, letterSpacing: '0.08em' }}>
        Technologies
      </h2>
      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {techNames.map((name, i) => (
              <tr key={name} style={{ background: i % 2 === 0 ? C.surface : C.bg, borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                <td className="px-3 py-2" style={{ color: C.ink, fontFamily: FONT_MONO, fontSize: 13 }}>
                  {name}
                </td>
                <td className="px-3 py-2">
                  <TierMark tier={techTierOf(a, name)} />
                </td>
                <td className="px-3 py-2">
                  <TierMark tier={techTierOf(b, name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleSelect({ label, value, onChange }) {
  const id = `select-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs uppercase mb-1" style={{ fontFamily: FONT_MONO, color: C.inkFaint }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        style={{ background: C.surface, border: `1px solid ${C.borderStrong}`, color: C.ink, fontFamily: FONT_SANS }}
      >
        {ROLES.map((r) => (
          <option key={r.slug} value={r.slug}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ConfirmView({ role, changeFrom, onViewDetail, onExplore, onHistory }) {
  if (!role) return null;
  return (
    <div>
      <div
        className="w-12 h-12 rounded flex items-center justify-center mb-5"
        style={{ background: C.accentSoft, color: C.accent }}
      >
        <Check size={22} />
      </div>

      <h1 className="text-2xl mb-1" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.ink }}>
        Your target is now:
      </h1>
      <p className="text-xl mb-5" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.accent }}>
        {role.name}
      </p>

      {changeFrom && (
        <div className="mb-6 p-3 rounded" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <Rail items={[changeFrom, role.name]} activeIndex={1} dense />
        </div>
      )}

      <SectionLabel>Core focus</SectionLabel>
      <div className="flex flex-wrap gap-2 mb-6">
        {role.core.map((c) => (
          <Tag key={c} tone="core">
            {c}
          </Tag>
        ))}
      </div>

      <p className="text-sm mb-2" style={{ color: C.ink, lineHeight: 1.6 }}>
        CodeForge will use this target to personalize future technical preparation.
      </p>
      <p className="text-sm mb-8" style={{ color: C.inkMuted, lineHeight: 1.6 }}>
        You can change your target later — your previous learning history stays with you.
      </p>

      <div className="flex flex-wrap gap-3">
        <PrimaryButton onClick={onViewDetail}>View role details</PrimaryButton>
        <SecondaryButton onClick={onExplore}>Explore other roles</SecondaryButton>
        <SecondaryButton onClick={onHistory} icon={Clock}>
          View history
        </SecondaryButton>
      </div>
    </div>
  );
}

function HistoryView({ history, onBack }) {
  const sorted = [...history].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded"
        style={{ color: C.inkMuted }}
      >
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-2xl mb-5" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: C.ink }}>
        Your history
      </h1>

      {sorted.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: C.inkMuted }}>
          No history yet — once you select a target, changes will show up here.
        </p>
      ) : (
        <div className="grid gap-2">
          {sorted.map((h, i) => (
            <div key={i} className="p-3 rounded flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div>
                <p className="text-sm" style={{ fontFamily: FONT_SANS, fontWeight: 600, color: C.ink }}>
                  {h.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: C.inkFaint, fontFamily: FONT_MONO }}>
                  {formatDate(h.startedAt)} {h.endedAt ? `→ ${formatDate(h.endedAt)}` : '→ current'}
                </p>
              </div>
              {!h.endedAt && (
                <span className="text-xs px-2 py-1 rounded" style={{ background: C.accentSoft, color: C.accentStrong, fontFamily: FONT_MONO }}>
                  CURRENT
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
