'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ServerValidation } from './server-validation';
import { ArtifactReviewRequest } from './artifact-review';

export type SavedArtifact = { id: string; created_at: string; authority: string; content: { challenge_id: string; challenge_version?: number; language: 'javascript' | 'python' | 'java' | 'cpp'; code: string; explanation: string; assistance: string; passed: number | null; total: number | null } };
export function useArtifact(id: string | null) {
  const { user } = useAuth();
  const owner = user?.id;
  const [result, setResult] = useState<{ owner: string; id: string; data?: SavedArtifact; error?: string }>();
  useEffect(() => {
    if (!owner || !id) return;
    let active = true;
    void api.request<SavedArtifact>(`/coding/artifacts/${encodeURIComponent(id)}`).then(data => {
      if (active) setResult({ owner, id, data });
    }).catch(() => { if (active) setResult({ owner, id, error: 'This saved artifact is unavailable for your account. Return to coding to choose an accessible artifact.' }); });
    return () => { active = false; };
  }, [owner, id]);
  return result?.owner === owner && result?.id === id ? result : undefined;
}
export function ArtifactView({ id }: { id: string }) {
  const result = useArtifact(id);
  if (!result?.data) return <p role="status">{result?.error || 'Loading saved artifact...'}</p>;
  const { data } = result;
  return <article className="card p-6 space-y-4"><h1 className="text-2xl font-semibold">{data.content.challenge_id}</h1><p>Saved {new Date(data.created_at).toLocaleString()} · {data.content.language}</p><p>Browser-reported practice · Assistance: {data.content.assistance.toLowerCase().replaceAll('_', ' ')}</p><p>{data.content.total !== null ? `${data.content.passed}/${data.content.total} browser checks passed.` : 'No execution result recorded.'}</p><pre className="overflow-auto whitespace-pre-wrap rounded-lg border p-4">{data.content.code}</pre><h2 className="text-xl">Your explanation</h2><p className="whitespace-pre-wrap">{data.content.explanation || 'No explanation saved.'}</p><ServerValidation artifactId={data.id} /><ArtifactReviewRequest artifactId={data.id} /><Link className="btn-primary inline-flex" href={`/interview/setup?artifact_id=${data.id}&mode=project_defense`}>Explain this artifact in an interview</Link><p>Your interview uses a bounded excerpt from this saved version. Later draft edits do not change it.</p></article>;
}
