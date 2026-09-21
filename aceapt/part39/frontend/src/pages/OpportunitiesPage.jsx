import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import OpportunityCard from '../components/opportunities/OpportunityCard.jsx';
import AddOpportunityModal from '../components/opportunities/AddOpportunityModal.jsx';
import { EmptyState, LoadingState, ErrorState, Button } from '../components/shared/UI.jsx';

const TABS = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'saved', label: 'Saved' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'all', label: 'All' },
];

export default function OpportunitiesPage() {
  const [tab, setTab] = useState('recommended');
  const [opportunities, setOpportunities] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  const load = useCallback((t) => {
    setOpportunities(null);
    setError(null);
    api.listOpportunities(t).then((d) => setOpportunities(d.opportunities)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-xs text-ink-faint uppercase tracking-wide">Opportunities</p>
          <h1 className="font-display text-3xl mt-1">Which one deserves your time?</h1>
        </div>
        <Button onClick={() => setShowAdd(true)}>+ Add opportunity</Button>
      </div>

      <div className="flex gap-1 border-b border-border-soft overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={() => load(tab)} />}
      {!error && !opportunities && <LoadingState />}
      {!error && opportunities && opportunities.length === 0 && (
        <EmptyState
          title={tab === 'recommended' ? 'Your opportunity workspace is ready' : `No ${tab} opportunities yet`}
          subtitle={tab === 'recommended' ? 'Add or discover an opportunity to begin.' : 'Opportunities you save or shortlist will show up here.'}
          action={<Button onClick={() => setShowAdd(true)}>Add opportunity</Button>}
        />
      )}
      {!error && opportunities && opportunities.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {opportunities.map((o) => <OpportunityCard key={o.id} opportunity={o} />)}
        </div>
      )}

      {showAdd && (
        <AddOpportunityModal
          onClose={() => setShowAdd(false)}
          onAdded={(opp) => { setShowAdd(false); navigate(`/opportunities/${opp.id}`); }}
        />
      )}
    </div>
  );
}
