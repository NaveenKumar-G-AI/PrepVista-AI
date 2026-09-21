'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface SharedReport {
  session: {
    plan: string;
    final_score: number | null;
    completed_at: string | null;
    summary?: { answered_questions?: number; evaluated_questions?: number };
  };
  evaluations: { turn_number: number; question_text: string; rubric_category: string; score: number; classification: string }[];
  interpretation?: string;
  evaluation_status: string;
  is_shared: boolean;
}

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  return <SharedReportContent key={token} token={token} />;
}

function SharedReportContent({ token }: { token: string }) {
  const [report, setReport] = useState<SharedReport | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getSharedReport<SharedReport>(token).then(data => {
      if (!data.is_shared || !data.session || !Array.isArray(data.evaluations)) throw new Error('Invalid shared report');
      if (active) setReport(data);
    }).catch((err: Error & { status?: number }) => {
      if (active) {
        setReport(null);
        setError(err.status === 404 ? 'This shared report was not found or its link has expired.' : 'The shared report is temporarily unavailable. Please retry.');
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, reload]);

  const evaluations = report?.evaluations.filter(item => Number.isFinite(item.score) && item.score >= 0 && item.score <= 10) ?? [];
  const score = evaluations.length && Number.isFinite(report?.session.final_score) ? report?.session.final_score : null;
  const answered = report?.session.summary?.answered_questions;
  const completedAt = report?.session.completed_at ? new Date(report.session.completed_at) : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-5 py-12">
      <Link href="/" className="text-sm underline">PrepVista</Link>
      <h1 className="text-3xl font-semibold">Shared interview report</h1>
      <p className="text-sm text-[var(--text-secondary)]">Read-only summary shared by the interview owner. Recorded answers and private coaching are not included.</p>
      {loading ? <p role="status">Loading shared report…</p> : error ? (
        <div role="alert" className="space-y-4"><p>{error}</p><button className="btn-secondary" onClick={() => { setLoading(true); setError(''); setReload(value => value + 1); }}>Retry loading report</button></div>
      ) : report ? (
        <>
          <section className="glass-card space-y-3 p-6" aria-label="Interview summary">
            <p className="capitalize">{report.session.plan} interview</p>
            {completedAt && Number.isFinite(completedAt.getTime()) && <p>Completed {completedAt.toLocaleDateString()}</p>}
            <p className="text-4xl font-semibold">{score === null ? '—' : `${score}/100`}</p>
            <p>{evaluations.length} answers evaluated{typeof answered === 'number' ? ` of ${answered} recorded` : ''}.</p>
            <p>{report.interpretation || (score === null ? 'Evaluation is unavailable. No performance score has been assigned.' : 'This score describes the evaluated answers only.')}</p>
          </section>
          <section className="space-y-4" aria-label="Evaluated questions">
            <h2 className="text-xl font-semibold">Evaluated questions</h2>
            {evaluations.length === 0 ? <p>No evaluated questions are available in this shared report yet.</p> : evaluations.map(item => (
              <article className="glass-card space-y-2 p-5" key={item.turn_number}>
                <h3 className="font-medium">{item.question_text}</h3>
                <p>{item.rubric_category.replaceAll('_', ' ')} · {item.score}/10</p>
                <p>{item.classification}</p>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}
