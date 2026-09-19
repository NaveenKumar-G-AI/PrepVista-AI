'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useWorkspace } from './lib/state';

export function ArtifactActions({ challengeId, challengeVersion = 1, parentArtifactId, code, explanation, language = 'javascript', assisted = false, passed, total }: { challengeId: string; challengeVersion?: number; parentArtifactId?: string; code: string; explanation: string; language?: 'javascript' | 'python' | 'java' | 'cpp'; assisted?: boolean; passed?: number; total?: number }) {
  const { user } = useAuth(); const { sync, save } = useWorkspace();
  const [saved, setSaved] = useState<{ id: string; key: string }>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pending = useRef<{ key: string; requestId: string } | undefined>(undefined);
  const content = { challenge_id: challengeId, challenge_version: challengeVersion, parent_artifact_id: parentArtifactId ?? null, language, code, explanation, assistance: assisted ? 'KNOWN_ASSISTED' : 'UNKNOWN', passed: passed ?? null, total: total ?? null };
  const key = JSON.stringify(content);
  async function submit() {
    if (!user || busy) return;
    setBusy(true); setError('');
    const missionId = new URLSearchParams(window.location.search).get('mission_id');
    const commandKey = JSON.stringify([key, missionId]);
    if (pending.current?.key !== commandKey) pending.current = { key: commandKey, requestId: crypto.randomUUID() };
    try {
      await save();
      const result = await api.request<{ id: string }>('/coding/artifacts', { method: 'POST', retries: 0, body: { ...content, mission_id: missionId, expected_owner_id: user.id, request_id: pending.current.requestId } });
      setSaved({ id: result.id, key });
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the artifact. Retry keeps the same request ID.'); }
    finally { setBusy(false); }
  }
  if (!sync) return <p className="text-sm text-secondary">Enable account sync to save this work for a project-defense interview. Downloads remain available.</p>;
  return <div className="space-y-3"><p className="text-sm">Save a fixed copy of this code and explanation for your next interview. Practice results remain browser-reported.</p><button className="btn-primary min-h-11" disabled={busy || !code.trim()} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save for interview'}</button>{error && <p role="alert">{error}</p>}{saved?.key === key && <Link className="btn-secondary ml-3 inline-flex" href={`/interview/setup?artifact_id=${saved.id}&mode=project_defense`}>Explain this artifact in an interview</Link>}</div>;
}
