'use client';
/**
 * PrepVista — College Admin: Department CRUD
 *
 * ✅ UPGRADED (Report §6.3 branch routing):
 *   - CANONICAL_BRANCHES: mirrors technical_taxonomy.py's 8 branch codes
 *   - normalizeDepartmentCode(): lightweight TS alias lookup (mirrors config.py's
 *     normalize_department()) so TPOs get instant feedback before saving
 *   - Smart branch-code combobox with auto-suggest + dropdown of 8 known branches
 *   - Routing-status chip per card: "Routed → CSE" vs "Generic Fallback"
 *   - Branch topic preview panel (expandable, per card and in the form)
 *   - Student count badge per card (from API)
 *   - Summary bar: mapped / unrecognized / coverage %
 *   - Filter tabs: All / Mapped / Needs Review
 *   - Inline delete confirmation (mobile-safe, no confirm() call)
 *   - Toast-style save feedback
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { BuildingIcon, EditIcon, PlusIcon, XIcon, ChevronDownIcon, CheckIcon, AlertIcon } from '@/components/icons';
import { api } from '@/lib/api';

// ─── Branch taxonomy (mirrors technical_taxonomy.py) ─────────────────────────
// Single source of truth for what the 8 canonical branch codes mean on the
// frontend. When adding a 9th branch, update technical_taxonomy.py first —
// then add a matching entry here.

interface BranchMeta {
  code: string;
  label: string;
  shortLabel: string;
  color: string;         // Tailwind bg token for the routing badge
  textColor: string;     // Tailwind text token
  topics: string[];      // 4 key topics shown in preview panel
}

const CANONICAL_BRANCHES: BranchMeta[] = [
  {
    code: 'cse',
    label: 'Computer Science Engineering',
    shortLabel: 'CSE',
    color: 'bg-blue-500/15',
    textColor: 'text-blue-400',
    topics: ['Data Structures & Algorithms', 'Operating Systems', 'DBMS & SQL', 'Computer Networks'],
  },
  {
    code: 'aids',
    label: 'AI & Data Science',
    shortLabel: 'AI&DS',
    color: 'bg-violet-500/15',
    textColor: 'text-violet-400',
    topics: ['Statistics & Probability', 'Core ML Algorithms', 'SQL & Data Querying', 'Model Evaluation Metrics'],
  },
  {
    code: 'aiml',
    label: 'AI & Machine Learning',
    shortLabel: 'AI&ML',
    color: 'bg-purple-500/15',
    textColor: 'text-purple-400',
    topics: ['Neural Networks & Deep Learning', 'Generative AI / LLMs / RAG', 'Bias-Variance & Regularization', 'MLOps & Deployment'],
  },
  {
    code: 'ece',
    label: 'Electronics & Communication Engineering',
    shortLabel: 'ECE',
    color: 'bg-amber-500/15',
    textColor: 'text-amber-400',
    topics: ['Analog Electronics', 'Digital Electronics', 'Communication Systems', 'Embedded Systems & Microcontrollers'],
  },
  {
    code: 'eee',
    label: 'Electrical & Electronics Engineering',
    shortLabel: 'EEE',
    color: 'bg-yellow-500/15',
    textColor: 'text-yellow-400',
    topics: ['Electrical Machines', 'Power Systems', 'Control Systems', 'Renewable Energy & Smart Grid'],
  },
  {
    code: 'mech',
    label: 'Mechanical Engineering',
    shortLabel: 'Mech',
    color: 'bg-orange-500/15',
    textColor: 'text-orange-400',
    topics: ['Thermodynamics', 'Fluid Mechanics', 'Manufacturing Processes', 'Machine Design / Theory of Machines'],
  },
  {
    code: 'civil',
    label: 'Civil Engineering',
    shortLabel: 'Civil',
    color: 'bg-green-500/15',
    textColor: 'text-green-400',
    topics: ['Structural Analysis & Design', 'Geotechnical Engineering', 'Construction Materials', 'Estimation & Quantity Surveying'],
  },
  {
    code: 'cyber',
    label: 'Cybersecurity',
    shortLabel: 'Cyber',
    color: 'bg-rose-500/15',
    textColor: 'text-rose-400',
    topics: ['CIA Triad & Core Principles', 'Web Application Security', 'Incident Response & Forensics', 'Cloud Security'],
  },
];

const BRANCH_BY_CODE = Object.fromEntries(CANONICAL_BRANCHES.map(b => [b.code, b]));

// ─── Alias normalization (mirrors config.py normalize_department()) ────────────
// Keep in sync with DEPARTMENT_ALIASES in config.py.
// Used for instant "auto-suggest" feedback without a round-trip to the server.
const DEPARTMENT_ALIASES: Record<string, string> = {
  // CSE
  cse: 'cse', cs: 'cse', 'computer science': 'cse', 'computer science and engineering': 'cse',
  'computer science engineering': 'cse', 'comp sci': 'cse', compsci: 'cse', 'information technology': 'cse', it: 'cse',
  // AI & DS
  aids: 'aids', 'ai and ds': 'aids', 'ai ds': 'aids', 'ai and data science': 'aids',
  'artificial intelligence and data science': 'aids', 'data science': 'aids', ds: 'aids',
  // AI & ML
  aiml: 'aiml', 'ai and ml': 'aiml', 'ai ml': 'aiml', 'ai and machine learning': 'aiml',
  'artificial intelligence and machine learning': 'aiml', 'machine learning': 'aiml', ml: 'aiml',
  // ECE
  ece: 'ece', 'electronics and communication': 'ece', 'electronics and communication engineering': 'ece',
  'e and ce': 'ece', ec: 'ece',
  // EEE
  eee: 'eee', 'electrical and electronics': 'eee', 'electrical and electronics engineering': 'eee',
  'e and ee': 'eee', electrical: 'eee',
  // Mech
  mech: 'mech', mechanical: 'mech', 'mechanical engineering': 'mech', me: 'mech',
  // Civil
  civil: 'civil', 'civil engineering': 'civil', ce: 'civil',
  // Cyber
  cyber: 'cyber', cybersecurity: 'cyber', 'cyber security': 'cyber', 'information security': 'cyber',
};

const DEGREE_PREFIXES = new Set(['btech', 'be', 'mtech', 'me', 'diploma', 'bsc', 'msc']);

function normalizeDepartmentCode(value: string): string | null {
  if (!value.trim()) return null;
  let key = value.trim().toLowerCase()
    .replace(/\./g, '')
    .replace(/-/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ');
  if (DEPARTMENT_ALIASES[key]) return DEPARTMENT_ALIASES[key];
  // strip leading degree prefix ("B.Tech CSE" → "CSE")
  const parts = key.split(' ');
  if (parts.length >= 2 && DEGREE_PREFIXES.has(parts[0])) {
    const rest = parts.slice(1).join(' ');
    if (DEPARTMENT_ALIASES[rest]) return DEPARTMENT_ALIASES[rest];
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  department_name: string;
  department_code: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  // ✅ ADDED: backend now returns these from its normalize_department() call
  canonical_branch_code: string | null;  // null → generic fallback
  student_count?: number;
}

type FilterTab = 'all' | 'mapped' | 'unrecognized';

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoutingBadge({ canonicalCode }: { canonicalCode: string | null }) {
  if (canonicalCode) {
    const branch = BRANCH_BY_CODE[canonicalCode];
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${branch?.color ?? 'bg-blue-500/15'} ${branch?.textColor ?? 'text-blue-400'}`}>
        <CheckIcon size={9} />
        {branch?.shortLabel ?? canonicalCode.toUpperCase()}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
      <AlertIcon size={9} />
      Generic Fallback
    </span>
  );
}

function BranchTopicsPreview({ canonicalCode }: { canonicalCode: string | null }) {
  const branch = canonicalCode ? BRANCH_BY_CODE[canonicalCode] : null;
  if (!branch) {
    return (
      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
        <p className="text-[11px] font-medium text-amber-400 mb-1">⚠ No branch module matched</p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Students in this department will receive generic technical questions instead of
          branch-specific ones. Map this department to a canonical branch code to enable
          targeted interview content.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] font-medium text-slate-400 mb-1.5">
        Technical module: <span className={branch.textColor}>{branch.label}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {branch.topics.map(t => (
          <span key={t} className="rounded-lg bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-400">{t}</span>
        ))}
        <span className="rounded-lg bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-500">+ 6 more…</span>
      </div>
    </div>
  );
}

// ─── Branch code combobox ────────────────────────────────────────────────────

interface BranchComboboxProps {
  value: string;
  onChange: (v: string) => void;
  suggestedCode: string | null;
  onAcceptSuggestion: () => void;
}

function BranchCombobox({ value, onChange, suggestedCode, onAcceptSuggestion }: BranchComboboxProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const resolvedCode = normalizeDepartmentCode(value);
  const matchedBranch = resolvedCode ? BRANCH_BY_CODE[resolvedCode] : null;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="e.g. CSE, Mechanical Engineering, B.Tech ECE…"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        >
          <ChevronDownIcon size={14} />
        </button>
      </div>

      {/* Auto-suggest chip */}
      {suggestedCode && suggestedCode !== value.trim().toLowerCase() && (
        <button
          type="button"
          onClick={onAcceptSuggestion}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <CheckIcon size={10} />
          Accept: <span className="font-semibold">{BRANCH_BY_CODE[suggestedCode]?.label ?? suggestedCode}</span>
        </button>
      )}

      {/* Resolved indicator */}
      {matchedBranch && (
        <p className={`mt-1.5 text-[11px] ${matchedBranch.textColor}`}>
          ✓ Maps to {matchedBranch.label}
        </p>
      )}
      {value.trim() && !matchedBranch && (
        <p className="mt-1.5 text-[11px] text-amber-400">
          ⚠ Not recognized — students will receive generic technical questions.
        </p>
      )}

      {/* Dropdown of 8 canonical branches */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Canonical branch codes</p>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {CANONICAL_BRANCHES.map(b => (
              <button
                key={b.code}
                type="button"
                onClick={() => { onChange(b.code); setOpen(false); }}
                className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
              >
                <span className={`inline-flex h-6 w-9 items-center justify-center rounded-md text-[10px] font-bold ${b.color} ${b.textColor}`}>
                  {b.shortLabel}
                </span>
                <span className="text-sm text-slate-300">{b.label}</span>
                {value.trim().toLowerCase() === b.code && <CheckIcon size={12} className="ml-auto text-blue-400" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-white/[0.06]">
            <p className="text-[10px] text-slate-500">You can also type any alias (e.g. "Comp Sci", "B.Tech ECE")</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delete confirmation state (mobile-safe, no confirm()) ──────────────────

function DeleteButton({ dept, onDelete }: { dept: Department; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-rose-400 mr-1">Delete?</span>
        <button
          type="button"
          onClick={() => { setConfirming(false); onDelete(); }}
          className="rounded-lg px-2 py-1 text-[10px] font-semibold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
        >Yes</button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10"
        >No</button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
      title={`Delete ${dept.department_name}`}
    >
      <XIcon size={14} />
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);

  // Derived from the typed code or name for auto-suggest in the form
  const suggestedFromName = normalizeDepartmentCode(form.name);
  const resolvedCode = normalizeDepartmentCode(form.code) ?? (form.code.trim().toLowerCase() || null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const load = useCallback(async () => {
    try {
      const res = await api.listCollegeDepartments<{ departments: Department[] }>();
      setDepartments(res.departments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load departments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', code: '', notes: '' });
    setShowForm(true);
  };

  const openEdit = (d: Department) => {
    setEditId(d.id);
    setForm({ name: d.department_name, code: d.department_code || '', notes: d.notes || '' });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api.updateCollegeDepartment(editId, {
          name: form.name.trim(),
          code: form.code.trim() || null,
          notes: form.notes.trim() || null,
        });
        showToast('Department updated.');
      } else {
        await api.createCollegeDepartment({
          name: form.name.trim(),
          code: form.code.trim() || null,
          notes: form.notes.trim() || null,
        });
        showToast('Department created.');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: Department) => {
    try {
      await api.deleteCollegeDepartment(d.id);
      showToast(`"${d.department_name}" deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    }
  };

  // ── Filtering ──────────────────────────────────────────────────────────────
  const mappedCount = departments.filter(d => d.canonical_branch_code).length;
  const unrecognizedCount = departments.length - mappedCount;

  const visibleDepts = departments.filter(d => {
    if (filterTab === 'mapped') return !!d.canonical_branch_code;
    if (filterTab === 'unrecognized') return !d.canonical_branch_code;
    return true;
  });

  const coveragePct = departments.length > 0
    ? Math.round((mappedCount / departments.length) * 100)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-2xl border border-green-500/20 bg-green-500/10 px-5 py-3 text-sm text-green-400 shadow-2xl backdrop-blur-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Departments</h1>
          <p className="text-sm text-slate-400">
            {departments.length} department{departments.length !== 1 ? 's' : ''} · {mappedCount} branch-routed
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary !px-4 !py-2 text-sm">
          <span className="inline-flex items-center gap-2"><PlusIcon size={15} />Add Department</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-start gap-2">
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Branch routing coverage bar */}
      {departments.length > 0 && (
        <div className="card !p-4 fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Branch routing coverage</span>
            <span className={`text-sm font-bold ${coveragePct === 100 ? 'text-green-400' : coveragePct >= 75 ? 'text-amber-400' : 'text-rose-400'}`}>
              {coveragePct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${coveragePct === 100 ? 'bg-green-500' : coveragePct >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2.5">
            <span className="text-[11px] text-slate-500">
              <span className="text-green-400 font-semibold">{mappedCount}</span> routed to branch modules
            </span>
            {unrecognizedCount > 0 && (
              <span className="text-[11px] text-slate-500">
                <span className="text-amber-400 font-semibold">{unrecognizedCount}</span> using generic fallback
              </span>
            )}
          </div>
          {unrecognizedCount > 0 && (
            <p className="mt-2 text-[11px] text-amber-400/80">
              ⚠ Students in unrouted departments receive generic technical questions instead of branch-specific ones.
              Edit those departments and select a canonical branch code to fix this.
            </p>
          )}
        </div>
      )}

      {/* Filter tabs */}
      {departments.length > 0 && (
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
          {([
            { key: 'all', label: `All (${departments.length})` },
            { key: 'mapped', label: `Routed (${mappedCount})` },
            { key: 'unrecognized', label: `Needs Review (${unrecognizedCount})` },
          ] as { key: FilterTab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${filterTab === tab.key
                  ? 'bg-white/10 text-white'
                  : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">{editId ? 'Edit' : 'Create'} Department</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <XIcon size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Department Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="e.g. Computer Science and Engineering"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                {/* Auto-suggest from department name */}
                {suggestedFromName && !form.code && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, code: suggestedFromName }))}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-400 hover:bg-blue-500/20 transition-colors"
                  >
                    <CheckIcon size={10} />
                    Auto-detect branch: <span className="font-semibold">{BRANCH_BY_CODE[suggestedFromName]?.label ?? suggestedFromName}</span>
                  </button>
                )}
              </div>

              {/* Branch code combobox */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Branch Code
                  <span className="ml-1 text-[10px] font-normal text-slate-500 normal-case">(determines which technical module students receive)</span>
                </label>
                <div className="mt-1">
                  <BranchCombobox
                    value={form.code}
                    onChange={v => setForm(f => ({ ...f, code: v }))}
                    suggestedCode={suggestedFromName}
                    onAcceptSuggestion={() => setForm(f => ({ ...f, code: suggestedFromName ?? '' }))}
                  />
                </div>
              </div>

              {/* Branch topic preview inside form */}
              {form.code.trim() && (
                <BranchTopicsPreview canonicalCode={resolvedCode} />
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional — e.g. 'Core branch, 4th year only'"
                  className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 !py-2.5">
                  {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
        </div>
      ) : visibleDepts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center text-slate-500">
          {departments.length === 0
            ? 'No departments yet. Add your first department to enable branch-aware technical interviews for your students.'
            : `No departments in the "${filterTab}" filter.`}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 slide-up">
          {visibleDepts.map(d => {
            const branch = d.canonical_branch_code ? BRANCH_BY_CODE[d.canonical_branch_code] : null;
            const isExpanded = expandedPreview === d.id;

            return (
              <div
                key={d.id}
                className="card !p-5 group hover:border-blue-500/20 transition-all"
              >
                {/* Card header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${branch?.color ?? 'bg-slate-700/40'}`}>
                      <BuildingIcon size={16} className={branch?.textColor ?? 'text-slate-400'} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{d.department_name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <RoutingBadge canonicalCode={d.canonical_branch_code} />
                        {d.department_code && d.department_code !== d.canonical_branch_code && (
                          <span className="text-[10px] font-mono text-slate-500">{d.department_code}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                      title="Edit department"
                    >
                      <EditIcon size={14} />
                    </button>
                    <DeleteButton dept={d} onDelete={() => handleDelete(d)} />
                  </div>
                </div>

                {/* Student count */}
                {typeof d.student_count === 'number' && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {d.student_count} student{d.student_count !== 1 ? 's' : ''}
                  </div>
                )}

                {/* Notes */}
                {d.notes && (
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">{d.notes}</p>
                )}

                {/* Branch module preview toggle */}
                <button
                  type="button"
                  onClick={() => setExpandedPreview(isExpanded ? null : d.id)}
                  className="mt-3 w-full text-left text-[11px] text-slate-500 hover:text-slate-400 transition-colors flex items-center gap-1"
                >
                  <ChevronDownIcon
                    size={12}
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                  {isExpanded ? 'Hide' : 'Show'} technical module topics
                </button>

                {isExpanded && (
                  <BranchTopicsPreview canonicalCode={d.canonical_branch_code} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}