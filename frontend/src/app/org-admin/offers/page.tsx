"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Tone = 'emerald' | 'blue' | 'amber' | 'slate' | 'rose';

interface OfferMetrics {
  total: number;
  verified: number;
  accepted: number;
  pending: number;
  declined: number;
  expiringSoon: number;
}

interface JoiningMetrics {
  confirmed: number;
  pending: number;
  delayed: number;
  didNotJoin: number;
}

interface OffersSummary {
  offerMetrics: OfferMetrics;
  joiningMetrics: JoiningMetrics;
}

interface CompanyScorecardRow {
  companyId: string;
  offersExtended: number;
  acceptanceRate: number | null;
  joiningRate: number | null;
}

interface TodayDigest {
  counts: {
    expiringToday: number;
    overdueNotExpired: number;
    evidenceAwaitingVerification: number;
    staleInVerification: number;
    joiningToday: number;
  };
}

interface OffersInsights {
  funnel: { stageReachedCounts: Record<string, number> };
  companyScorecard: CompanyScorecardRow[];
  todayDigest: TodayDigest;
  companyNameById: Record<string, string>;
}

interface LedgerEntry {
  key: string;
  label: string;
  value: number;
  tone: Tone;
}

const TONE_TEXT: Record<Tone, string> = {
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  slate: 'text-slate-400',
  rose: 'text-rose-400',
};

const TONE_PANEL: Record<Tone, string> = {
  emerald: 'border-emerald-500/20 bg-emerald-500/10',
  blue: 'border-blue-500/20 bg-blue-500/10',
  amber: 'border-amber-500/20 bg-amber-500/10',
  slate: 'border-slate-500/20 bg-slate-500/10',
  rose: 'border-rose-500/20 bg-rose-500/10',
};

function fetchOffersAnalytics(): Promise<[OffersSummary, OffersInsights]> {
  return Promise.all([
    api.getOffersSummary<OffersSummary>(),
    api.getOffersInsights<OffersInsights>(),
  ]);
}

export default function OffersPage() {
  const [summary, setSummary] = useState<OffersSummary | null>(null);
  const [insights, setInsights] = useState<OffersInsights | null>(null);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setError('');
    const [summaryResponse, insightsResponse] = await fetchOffersAnalytics();
    setSummary(summaryResponse);
    setInsights(insightsResponse);
  }, []);

  useEffect(() => {
    let active = true;
    fetchOffersAnalytics()
      .then(([summaryResponse, insightsResponse]) => {
        if (!active) return;
        setSummary(summaryResponse);
        setInsights(insightsResponse);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load offers data.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <div className="p-8 text-rose-400" role="alert">{error}</div>;
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
      <OfferOperations onChanged={loadAnalytics} />
    </div>
  );
}

function TpoOffersSummary({ offerMetrics, joiningMetrics }: { offerMetrics: OfferMetrics; joiningMetrics: JoiningMetrics }) {
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

function Ledger({ title, headline, headlineLabel, entries }: {
  title: string;
  headline: number;
  headlineLabel: string;
  entries: LedgerEntry[];
}) {
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
            <span className={`text-xl font-bold ${TONE_TEXT[entry.tone]}`}>
              {entry.value}
            </span>
            <span className="text-xs text-slate-400 mt-1 uppercase tracking-wide">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TpoInsightsPanel({ funnel, companyScorecard, todayDigest, companyNameById = {}, maxCompanyRows = 6 }: {
  funnel: OffersInsights['funnel'];
  companyScorecard: CompanyScorecardRow[];
  todayDigest: TodayDigest;
  companyNameById?: Record<string, string>;
  maxCompanyRows?: number;
}) {
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

function TodayItem({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const isZero = !value;
  return (
    <div className={`flex-1 min-w-[150px] p-4 rounded-lg border ${isZero ? 'opacity-50 border-white/5 bg-transparent' : TONE_PANEL[tone]}`}>
      <div className={`text-2xl font-bold mb-1 ${isZero ? 'text-slate-500' : TONE_TEXT[tone]}`}>{value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  UNDER_VERIFICATION: 'Under verification',
  VERIFIED: 'Verified',
  PUBLISHED: 'Published',
  ACCEPTANCE_PENDING: 'Awaiting response',
  ACCEPTED: 'Accepted',
};

function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '\u2014';
  return `${Math.round(rate * 100)}%`;
}

interface OfferRow {
  id: string;
  season_id: string;
  student_id: string;
  drive_id: string;
  company_id: string;
  student_name: string;
  student_email: string;
  company_name: string;
  role_title: string;
  status: string;
  joining_status: string | null;
  acceptance_deadline: string;
  joining_date: string;
  currency: string;
  ctc_total_minor: number;
}

interface OfferDetail {
  offer: OfferRow & { drive_title: string; location: string; work_mode: string; employment_type: string };
  joining: { status: string; expected_joining_date: string; confirmed_joining_date: string | null } | null;
  legal_next_states: string[];
  legal_joining_states: string[];
  versions: Array<{ id: string; version_number: number; reason: string | null; created_at: string }>;
  documents: Array<{ id: string; document_type: string; verification_status: string; uploaded_at: string }>;
}

interface Season { id: string; name: string; starts_on: string; ends_on: string; status: string }
interface StudentOption { user_id: string; full_name: string; email: string; student_code: string | null }
interface DriveOption { id: string; title: string; company_name: string; company_id: string | null; role: string; status: string }
interface CompanyOption { id: string; name: string }

function offerLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function operationError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The offer operation failed.';
}

function OfferOperations({ onChanged }: { onChanged: () => Promise<void> }) {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [drives, setDrives] = useState<DriveOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [driveId, setDriveId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [workMode, setWorkMode] = useState('ONSITE');
  const [location, setLocation] = useState('');
  const [offerDate, setOfferDate] = useState('');
  const [acceptanceDeadline, setAcceptanceDeadline] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [totalCtc, setTotalCtc] = useState('');
  const [fixedCtc, setFixedCtc] = useState('');
  const [reason, setReason] = useState('');
  const [joiningReason, setJoiningReason] = useState('');
  const [joiningEvidence, setJoiningEvidence] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('OFFER_LETTER');
  const [seasonName, setSeasonName] = useState('');
  const [seasonStart, setSeasonStart] = useState('');
  const [seasonEnd, setSeasonEnd] = useState('');

  const loadOffers = useCallback(async () => {
    const params: Record<string, string | number> = { page_size: 100 };
    if (statusFilter) params.status = statusFilter;
    if (search.trim()) params.search = search.trim();
    const response = await api.listOffers<{ items: OfferRow[]; total: number }>(params);
    setOffers(response.items ?? []);
    setTotal(response.total ?? 0);
    setSelectedId((current) => current && response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
  }, [search, statusFilter]);

  const loadResources = useCallback(async () => {
    const [seasonResponse, studentResponse, driveResponse, companyResponse] = await Promise.all([
      api.listPlacementSeasons<{ items: Season[] }>(),
      api.listCollegeStudents<{ students: StudentOption[] }>('page_size=100'),
      api.listPlacementDrives<{ items: DriveOption[] }>(),
      api.listRecruiterCompanies<{ items: CompanyOption[] }>({ page_size: 100 }),
    ]);
    setSeasons(seasonResponse.items ?? []);
    setStudents(studentResponse.students ?? []);
    setDrives(driveResponse.items ?? []);
    setCompanies(companyResponse.items ?? []);
    setSeasonId((current) => current || seasonResponse.items?.[0]?.id || '');
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadOffers(), loadResources()]);
    } catch (loadError) {
      setError(operationError(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadOffers, loadResources]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api.getOffer<OfferDetail>(id));
    } catch (loadError) {
      setDetail(null);
      setError(operationError(loadError));
    }
  }, []);

  useEffect(() => {
    void loadResources().catch((loadError) => setError(operationError(loadError)));
  }, [loadResources]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void loadOffers()
        .catch((loadError) => setError(operationError(loadError)))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadOffers]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [loadDetail, selectedId]);

  function chooseDrive(value: string) {
    setDriveId(value);
    const drive = drives.find((item) => item.id === value);
    if (drive) {
      setRoleTitle(drive.role);
      if (drive.company_id) setCompanyId(drive.company_id);
    }
  }

  async function perform(action: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      await Promise.all([loadOffers(), loadResources()]);
      if (selectedId) await loadDetail(selectedId);
      try {
        await onChanged();
      } catch {
        setError('The operation succeeded, but dashboard metrics could not be refreshed. Use Refresh to retry.');
      }
      setNotice(message);
      return true;
    } catch (actionError) {
      setError(operationError(actionError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createSeason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await api.createPlacementSeason<Season>({ name: seasonName, starts_on: seasonStart, ends_on: seasonEnd }).catch((actionError) => {
      setError(operationError(actionError));
      return null;
    });
    if (!created) return;
    await loadResources();
    setSeasonId(created.id); setSeasonName(''); setSeasonStart(''); setSeasonEnd(''); setNotice('Placement season created.');
  }

  async function closeSeason(id: string) {
    const succeeded = await perform(() => api.closePlacementSeason(id), 'Placement season closed.');
    if (succeeded && seasonId === id) setSeasonId('');
  }

  async function createOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deadline = new Date(acceptanceDeadline);
    if (Number.isNaN(deadline.getTime())) { setError('Choose a valid acceptance deadline.'); return; }
    const totalMinor = Math.round(Number(totalCtc) * 100);
    const fixedMinor = Math.round(Number(fixedCtc) * 100);
    if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(fixedMinor)) { setError('Enter valid CTC values.'); return; }
    let createdId = '';
    const succeeded = await perform(async () => {
      const created = await api.createOffer<OfferRow>({
        season_id: seasonId, student_id: studentId, drive_id: driveId, company_id: companyId,
        role_title: roleTitle, employment_type: employmentType, work_mode: workMode, location,
        offer_date: offerDate, acceptance_deadline: deadline.toISOString(), joining_date: joiningDate,
        currency: 'INR', ctc_total_minor: totalMinor, ctc_fixed_minor: fixedMinor,
      });
      createdId = created.id;
    }, 'Offer recorded and versioned.');
    if (succeeded) {
      setSelectedId(createdId); setShowCreate(false); setStudentId(''); setDriveId(''); setCompanyId('');
      setRoleTitle(''); setLocation(''); setOfferDate(''); setAcceptanceDeadline(''); setJoiningDate(''); setTotalCtc(''); setFixedCtc('');
    }
  }

  async function transition(status: string) {
    if (!selectedId) return;
    const succeeded = await perform(() => api.transitionOffer(selectedId, { to_status: status, reason: reason || undefined }), `Offer moved to ${offerLabel(status)}.`);
    if (succeeded) setReason('');
  }

  async function transitionJoining(status: string) {
    if (!selectedId) return;
    const succeeded = await perform(() => api.updateOfferJoining(selectedId, {
      to_status: status,
      reason: joiningReason || undefined,
      evidence_document_id: joiningEvidence || undefined,
    }), `Joining moved to ${offerLabel(status)}.`);
    if (succeeded) { setJoiningReason(''); setJoiningEvidence(''); }
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !documentFile) return;
    const succeeded = await perform(
      () => api.uploadOfferDocument(selectedId, documentFile, documentType),
      'Offer evidence uploaded for verification.',
    );
    if (succeeded) setDocumentFile(null);
  }

  async function verifyDocument(documentId: string) {
    if (!selectedId) return;
    await perform(() => api.verifyOfferDocument(selectedId, documentId), 'Offer evidence verified.');
  }

  async function downloadDocument(documentId: string) {
    if (!selectedId) return;
    setError('');
    try {
      const response = await api.getOfferDocumentDownload(selectedId, documentId);
      window.open(response.url, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      setError(operationError(downloadError));
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5" aria-label="Offer operations">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Offer operations</h2><p className="text-sm text-slate-400">{total} versioned offers</p></div><div className="flex gap-2"><button type="button" onClick={() => void loadAll()} className="rounded-lg border border-white/10 px-3 py-2 text-sm">Refresh</button><button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold">New offer</button></div></div>
      {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}

      <details open={seasons.length === 0} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Placement seasons ({seasons.length} active)</summary>
        <form onSubmit={createSeason} className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-4"><p className="text-xs text-slate-400">Create an organization-owned season before recording its offers.</p></div>
          <input required value={seasonName} onChange={(event) => setSeasonName(event.target.value)} placeholder="2026 placements" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          <input required aria-label="Season start" type="date" value={seasonStart} onChange={(event) => setSeasonStart(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          <input required aria-label="Season end" type="date" value={seasonEnd} onChange={(event) => setSeasonEnd(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold">Create season</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{seasons.map((season) => <span key={season.id} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-xs">{season.name}<button type="button" disabled={busy} onClick={() => void closeSeason(season.id)} className="text-rose-300 hover:underline disabled:opacity-50">Close</button></span>)}</div>
      </details>

      {showCreate && <form onSubmit={createOffer} className="grid gap-3 rounded-lg border border-white/10 bg-slate-950 p-4 md:grid-cols-3">
        <select required value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option value="">Season</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option value="">Student</option>{students.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name || item.email}</option>)}</select>
        <select required value={driveId} onChange={(event) => chooseDrive(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option value="">Drive</option>{drives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <select required value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option value="">Company</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input required value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} placeholder="Role title" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option>FULL_TIME</option><option>INTERNSHIP</option><option>INTERN_TO_FULL_TIME</option><option>CONTRACT</option><option>OTHER</option></select>
        <select value={workMode} onChange={(event) => setWorkMode(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option>ONSITE</option><option>REMOTE</option><option>HYBRID</option></select>
        <label className="text-xs text-slate-400">Offer date<input required type="date" value={offerDate} onChange={(event) => setOfferDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-400">Acceptance deadline<input required type="datetime-local" value={acceptanceDeadline} onChange={(event) => setAcceptanceDeadline(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-400">Joining date<input required type="date" value={joiningDate} onChange={(event) => setJoiningDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
        <input required min="0" step="0.01" type="number" value={totalCtc} onChange={(event) => setTotalCtc(event.target.value)} placeholder="Total CTC (INR)" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input required min="0" step="0.01" type="number" value={fixedCtc} onChange={(event) => setFixedCtc(event.target.value)} placeholder="Fixed CTC (INR)" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <button disabled={busy || seasons.length === 0} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50 md:col-span-3">{busy ? 'Saving…' : 'Record offer'}</button>
      </form>}

      <div className="flex flex-wrap gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search offers" className="min-w-52 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"><option value="">All statuses</option>{Object.keys(OFFER_STATUS_LABELS).map((status) => <option key={status}>{status}</option>)}</select></div>
      {loading ? <p className="text-sm text-slate-400">Loading offer ledger…</p> : <div className="grid gap-4 lg:grid-cols-[360px_1fr]"><div className="max-h-[620px] space-y-2 overflow-auto">{offers.length === 0 && <p className="text-sm text-slate-400">No offers match this filter.</p>}{offers.map((offer) => <button key={offer.id} type="button" onClick={() => setSelectedId(offer.id)} className={`w-full rounded-lg border p-3 text-left ${selectedId === offer.id ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-slate-950'}`}><strong className="block">{offer.student_name || offer.student_email}</strong><span className="block text-sm text-slate-400">{offer.company_name} · {offer.role_title}</span><span className="mt-2 inline-block text-xs text-blue-300">{offerLabel(offer.status)}</span></button>)}</div>
        <div className="space-y-4 rounded-lg border border-white/10 bg-slate-950 p-4">{!detail ? <p className="text-sm text-slate-400">Select an offer.</p> : <><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-lg font-bold">{detail.offer.student_name}</h3><p className="text-sm text-slate-400">{detail.offer.company_name} · {detail.offer.role_title}</p></div><span className="text-sm text-blue-300">{offerLabel(detail.offer.status)}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><p>CTC: <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: detail.offer.currency }).format(detail.offer.ctc_total_minor / 100)}</strong></p><p>Deadline: {new Date(detail.offer.acceptance_deadline).toLocaleString()}</p><p>Joining: {detail.offer.joining_date}</p><p>Mode: {offerLabel(detail.offer.work_mode)}</p></div>
          <div><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Transition reason (optional)" className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" /><div className="mt-2 flex flex-wrap gap-2">{detail.legal_next_states.map((status) => <button key={status} type="button" disabled={busy} onClick={() => void transition(status)} className="rounded-lg border border-blue-500/40 px-3 py-2 text-sm text-blue-300 disabled:opacity-50">{offerLabel(status)}</button>)}</div></div>
          <div className="border-t border-white/10 pt-4"><h4 className="font-semibold">Private evidence documents</h4><div className="mt-2 space-y-2">{detail.documents.length === 0 && <p className="text-xs text-slate-500">No evidence documents uploaded.</p>}{detail.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] p-2 text-xs"><span>{offerLabel(document.document_type)} · {offerLabel(document.verification_status)}</span><div className="flex gap-2"><button type="button" onClick={() => void downloadDocument(document.id)} className="text-blue-300 hover:underline">Open</button>{document.verification_status !== 'VERIFIED' && <button type="button" disabled={busy} onClick={() => void verifyDocument(document.id)} className="text-emerald-300 hover:underline disabled:opacity-50">Verify</button>}</div></div>)}</div><form onSubmit={uploadDocument} className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]"><input required type="file" accept="application/pdf,.pdf" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} className="min-w-0 text-xs text-slate-400" /><select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-xs"><option>OFFER_LETTER</option><option>APPOINTMENT_DOCUMENT</option><option>EMPLOYMENT_CONFIRMATION</option><option>JOINING_LETTER</option><option>OTHER</option></select><button disabled={busy || !documentFile} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold disabled:opacity-50">Upload PDF</button></form></div>
          {detail.joining && <div className="border-t border-white/10 pt-4"><h4 className="font-semibold">Joining · {offerLabel(detail.joining.status)}</h4><div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={joiningReason} onChange={(event) => setJoiningReason(event.target.value)} maxLength={1000} placeholder="Reason (required for did not join)" className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" /><select value={joiningEvidence} onChange={(event) => setJoiningEvidence(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option value="">Verified joining evidence</option>{detail.documents.filter((document) => document.verification_status === 'VERIFIED').map((document) => <option key={document.id} value={document.id}>{offerLabel(document.document_type)}</option>)}</select></div><p className="mt-1 text-xs text-slate-500">Verified evidence is required before marking a student joined.</p><div className="mt-2 flex flex-wrap gap-2">{detail.legal_joining_states.map((status) => <button key={status} type="button" disabled={busy} onClick={() => void transitionJoining(status)} className="rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-300 disabled:opacity-50">{offerLabel(status)}</button>)}</div></div>}
          <div className="border-t border-white/10 pt-4"><h4 className="font-semibold">Version history</h4><div className="mt-2 space-y-1 text-xs text-slate-400">{detail.versions.map((version) => <p key={version.id}>v{version.version_number} · {new Date(version.created_at).toLocaleString()} · {version.reason || 'No reason recorded'}</p>)}</div></div></>}</div></div>}
    </section>
  );
}

const OFFER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', RECEIVED: 'Received', UNDER_VERIFICATION: 'Under verification', VERIFIED: 'Verified',
  PUBLISHED: 'Published', ACCEPTANCE_PENDING: 'Acceptance pending', ACCEPTED: 'Accepted',
  DECLINED: 'Declined', EXPIRED: 'Expired', WITHDRAWN: 'Withdrawn', CANCELLED: 'Cancelled',
};
