// @ts-nocheck
"use client";

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function OffersPage() {
  const [summary, setSummary] = useState(null);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    api.getOffersSummary().then(setSummary).catch(console.error);
    api.getOffersInsights().then(setInsights).catch(console.error);
  }, []);

  if (!summary || !insights) return <div className="p-8 text-slate-400">Loading Offers Data...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-5">
      <h1 className="text-2xl font-bold text-white mb-6">Offers &amp; Joining Dashboard</h1>
      <TpoOffersSummary offerMetrics={summary.offerMetrics} joiningMetrics={summary.joiningMetrics} />
      <TpoInsightsPanel 
        funnel={insights.funnel} 
        companyScorecard={insights.companyScorecard} 
        todayDigest={insights.todayDigest} 
        companyNameById={insights.companyNameById} 
      />
    </div>
  );
}

function TpoOffersSummary({ offerMetrics, joiningMetrics }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Offers and joining summary">
      <Ledger
        title="Offers"
        headline={offerMetrics.total}
        headlineLabel="total"
        entries={[
          { key: 'verified', label: 'Verified', value: offerMetrics.verified, tone: 'emerald' },
          { key: 'accepted', label: 'Accepted', value: offerMetrics.accepted, tone: 'blue' },
          { key: 'pending', label: 'Pending', value: offerMetrics.pending, tone: 'amber' },
          { key: 'declined', label: 'Declined', value: offerMetrics.declined, tone: 'slate' },
          { key: 'expiring', label: 'Expiring soon', value: offerMetrics.expiringSoon, tone: 'rose' },
        ]}
      />
      <Ledger
        title="Joining"
        headline={joiningMetrics.confirmed}
        headlineLabel="joined"
        entries={[
          { key: 'joining-pending', label: 'Pending', value: joiningMetrics.pending, tone: 'amber' },
          { key: 'joining-delayed', label: 'Delayed', value: joiningMetrics.delayed, tone: 'amber' },
          { key: 'did-not-join', label: 'Did not join', value: joiningMetrics.didNotJoin, tone: 'rose' },
        ]}
      />
    </section>
  );
}

function Ledger({ title, headline, headlineLabel, entries }) {
  return (
    <div className="card bg-white/5 border border-white/10 p-5 rounded-xl">
      <div className="flex justify-between items-center mb-6">
        <span className="text-lg font-bold text-white">{title}</span>
        <span className="text-2xl font-bold text-white">
          {headline} <span className="text-sm font-normal text-slate-400">{headlineLabel}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {entries.map((entry) => (
          <div key={entry.key} className="flex flex-col p-3 rounded-lg bg-white/5">
            <span className={`text-xl font-bold text-${entry.tone}-400`}>
              {entry.value}
            </span>
            <span className="text-xs text-slate-400 mt-1 uppercase tracking-wide">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TpoInsightsPanel({ funnel, companyScorecard, todayDigest, companyNameById = {}, maxCompanyRows = 6 }) {
  const maxStageCount = Math.max(1, ...Object.values(funnel.stageReachedCounts));

  return (
    <section className="space-y-6" aria-label="Placement insights">
      <div className="card bg-white/5 border border-white/10 p-5 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-4">Conversion funnel</h3>
        <div className="space-y-3">
          {Object.entries(funnel.stageReachedCounts).map(([stage, count]) => (
            <div className="flex items-center gap-4" key={stage}>
              <span className="w-32 text-sm text-slate-400">{STAGE_LABELS[stage] ?? stage}</span>
              <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.max(4, (count / maxStageCount) * 100)}%` }}
                />
              </div>
              <span className="w-8 text-right text-sm font-bold text-white">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card bg-white/5 border border-white/10 p-5 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-4">Company scorecard</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="pb-2">Company</th>
              <th className="pb-2">Offers</th>
              <th className="pb-2">Acceptance</th>
              <th className="pb-2">Joining</th>
            </tr>
          </thead>
          <tbody>
            {companyScorecard.slice(0, maxCompanyRows).map((row) => (
              <tr key={row.companyId} className="border-b border-white/5">
                <td className="py-3 text-white">{companyNameById[row.companyId] ?? row.companyId}</td>
                <td className="py-3 text-slate-300 font-mono">{row.offersExtended}</td>
                <td className="py-3 text-slate-300 font-mono">{formatPercent(row.acceptanceRate)}</td>
                <td className="py-3 text-slate-300 font-mono">{formatPercent(row.joiningRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card bg-white/5 border border-white/10 p-5 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-4">Needs attention today</h3>
        <div className="flex flex-wrap gap-4">
          <TodayItem label="Expiring today" value={todayDigest.counts.expiringToday} tone="amber" />
          <TodayItem label="Overdue, not expired" value={todayDigest.counts.overdueNotExpired} tone="rose" />
          <TodayItem label="Evidence awaiting verification" value={todayDigest.counts.evidenceAwaitingVerification} tone="amber" />
          <TodayItem label="Stuck in verification" value={todayDigest.counts.staleInVerification} tone="rose" />
          <TodayItem label="Joining today" value={todayDigest.counts.joiningToday} tone="emerald" />
        </div>
      </div>
    </section>
  );
}

function TodayItem({ label, value, tone }) {
  const isZero = !value;
  return (
    <div className={`flex-1 min-w-[150px] p-4 rounded-lg border ${isZero ? 'opacity-50 border-white/5 bg-transparent' : `border-${tone}-500/20 bg-${tone}-500/10`}`}>
      <div className={`text-2xl font-bold mb-1 ${isZero ? 'text-slate-500' : `text-${tone}-400`}`}>{value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

const STAGE_LABELS = {
  RECEIVED: 'Received',
  UNDER_VERIFICATION: 'Under verification',
  VERIFIED: 'Verified',
  PUBLISHED: 'Published',
  ACCEPTANCE_PENDING: 'Awaiting response',
  ACCEPTED: 'Accepted',
};

function formatPercent(rate) {
  if (rate === null || rate === undefined) return '\u2014';
  return `${Math.round(rate * 100)}%`;
}
