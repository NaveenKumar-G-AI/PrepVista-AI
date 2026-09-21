import { useEffect, useState, useCallback } from 'react';
import { api, ApiError, type DevIdentity } from './api/client';
import type { Discovery, MyShortcuts, SessionMode, ShortcutDetail, ShortcutSummary } from './types';
import { ShortcutRow } from './components/ShortcutRow';
import { ShortcutDetailPanel } from './components/ShortcutDetailPanel';
import { AddShortcutForm } from './components/AddShortcutForm';
import { DiscoveryBanner } from './components/DiscoveryBanner';
import { RecommendationPlayground } from './components/RecommendationPlayground';
import { TrainingCenter } from './components/TrainingCenter';
import { ModeSwitcher } from './components/ModeSwitcher';
import { IdentityBar } from './components/IdentityBar';

type Tab = 'library' | 'try' | 'training';

const BUCKETS: { key: keyof Pick<MyShortcuts, 'trusted' | 'developing' | 'needsReview' | 'recentlyAdded' | 'recommended'>; label: string; empty: string }[] = [
  { key: 'trusted', label: 'Trusted', empty: 'Nothing trusted yet — that takes real, repeated evidence.' },
  { key: 'needsReview', label: 'Needs review', empty: 'Nothing flagged right now.' },
  { key: 'developing', label: 'Developing', empty: 'Nothing in progress yet.' },
  { key: 'recentlyAdded', label: 'Recently added', empty: 'Nothing added yet.' },
  { key: 'recommended', label: 'Worth exploring', empty: 'Nothing new to suggest right now.' },
];

export default function App() {
  const [identity, setIdentity] = useState<DevIdentity>({ studentId: 'demo-student-1', tenantId: 'dev-tenant' });
  const [mode, setMode] = useState<SessionMode>('PRACTICE');
  const [tab, setTab] = useState<Tab>('library');

  const [mine, setMine] = useState<MyShortcuts | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<ShortcutDetail | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.get<MyShortcuts>('/api/shortcuts/mine', identity), api.get<Discovery[]>('/api/discoveries/mine', identity)])
      .then(([m, d]) => {
        setMine(m);
        setDiscoveries(d);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? `${err.message} (is the backend running at the configured VITE_API_BASE_URL?)`
            : 'Could not reach the backend. Is it running?'
        );
      })
      .finally(() => setLoading(false));
  }, [identity]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (!openId) {
      setOpenDetail(null);
      return;
    }
    api.get<ShortcutDetail>(`/api/shortcuts/${openId}`, identity).then(setOpenDetail);
  }, [openId, identity]);

  const allForTraining: ShortcutSummary[] = mine ? [...mine.trusted, ...mine.developing] : [];

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-paper/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-inksoft">ACEAPT · Feature 57</p>
              <h1 className="font-display text-2xl text-ink">My Shortcuts</h1>
            </div>
            <IdentityBar identity={identity} onChange={setIdentity} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex gap-5 text-sm">
              {(['library', 'try', 'training'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`border-b-2 pb-1 transition-colors ${
                    tab === t ? 'border-ink text-ink' : 'border-transparent text-inksoft hover:text-ink'
                  }`}
                >
                  {t === 'library' ? 'Library' : t === 'try' ? 'Try a question' : 'Training'}
                </button>
              ))}
            </nav>
            <ModeSwitcher mode={mode} onChange={setMode} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {mode === 'FORMAL_ASSESSMENT' && (
          <div className="mb-6 rounded-lg border border-caution/30 bg-cautionbg px-4 py-3 text-sm text-caution">
            Formal assessment mode: strategy recommendations are switched off (sec. 95, 234).
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-caution/30 bg-cautionbg px-4 py-3 text-sm text-caution">
            {error}
            <button onClick={refresh} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {loading && !mine && <p className="text-[15px] text-inksoft">Loading…</p>}

        {tab === 'library' && mine && (
          <>
            <DiscoveryBanner discoveries={discoveries} />

            {mine.todaysFocus && (
              <p className="mb-6 text-sm text-inksoft">
                Today's focus: <span className="text-ink">{mine.todaysFocus.toLowerCase()}</span>
              </p>
            )}

            <div className="mb-6 flex justify-end">
              {!showAddForm && (
                <button onClick={() => setShowAddForm(true)} className="rounded-full bg-ink px-5 py-2 text-sm text-paper hover:opacity-90">
                  + Add personal shortcut
                </button>
              )}
            </div>

            {showAddForm && (
              <div className="mb-8">
                <AddShortcutForm
                  identity={identity}
                  onCreated={refresh}
                  onCancel={() => {
                    setShowAddForm(false);
                    refresh();
                  }}
                />
              </div>
            )}

            {BUCKETS.map((bucket) => {
              const items = mine[bucket.key];
              return (
                <section key={bucket.key} className="mb-8">
                  <h2 className="mb-1 font-display text-lg text-ink">{bucket.label}</h2>
                  {items.length === 0 ? (
                    <p className="border-b border-line py-3 text-sm text-inksoft">{bucket.empty}</p>
                  ) : (
                    <div>
                      {items.map((s) => (
                        <ShortcutRow key={s.shortcutId} shortcut={s} onOpen={() => setOpenId(s.shortcutId)} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}

        {tab === 'try' && <RecommendationPlayground identity={identity} mode={mode} />}

        {tab === 'training' && <TrainingCenter identity={identity} candidates={allForTraining} />}
      </main>

      {openDetail && (
        <ShortcutDetailPanel
          shortcut={openDetail}
          identity={identity}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            refresh();
            if (openId) api.get<ShortcutDetail>(`/api/shortcuts/${openId}`, identity).then(setOpenDetail);
          }}
        />
      )}
    </div>
  );
}
