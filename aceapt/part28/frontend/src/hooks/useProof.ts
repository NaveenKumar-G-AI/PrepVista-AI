import { useCallback, useEffect, useState } from 'react';
import { proofApi, type ProofApiConfig } from '../api/proofApi.js';
import type {
  ProofStatus, ProofSnapshot, TargetedVerificationPlan, CompleteVerificationResponse,
} from '../api/types.js';

export type ProofView = 'hero' | 'pre-simulation' | 'simulation' | 'result';

export interface UseProofOptions {
  api: ProofApiConfig;
  targetId: string;
}

export function useProof({ api, targetId }: UseProofOptions) {
  const [status, setStatus] = useState<ProofStatus | null>(null);
  const [history, setHistory] = useState<ProofSnapshot[]>([]);
  const [view, setView] = useState<ProofView>('hero');
  const [plan, setPlan] = useState<TargetedVerificationPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CompleteVerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [statusRes, historyRes] = await Promise.all([
      proofApi.getStatus(api, targetId),
      proofApi.getHistory(api, targetId),
    ]);
    setStatus(statusRes);
    setHistory(historyRes.history);
  }, [api, targetId]);

  useEffect(() => {
    refresh().catch((err) => setError((err as Error).message));
  }, [refresh]);

  const proveReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await proofApi.start(api, targetId);
      setPlan(res.plan);
      if (res.sessionId) {
        setSessionId(res.sessionId);
        setView('pre-simulation');
      } else {
        // Section 20 — evidence already sufficient; nothing to run right now.
        await refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, targetId, refresh]);

  const beginSimulation = useCallback(() => setView('simulation'), []);
  const cancelPreSimulation = useCallback(() => setView('hero'), []);

  const recordResponse = useCallback(async (response: Parameters<typeof proofApi.respond>[1]) => {
    await proofApi.respond(api, response);
  }, [api]);

  const finishSimulation = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await proofApi.complete(api, sessionId);
      setOutcome(res);
      setView('result');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, sessionId, refresh]);

  const backToHero = useCallback(() => {
    setView('hero');
    setPlan(null);
    setSessionId(null);
    setOutcome(null);
  }, []);

  return {
    status, history, view, plan, sessionId, outcome, loading, error,
    proveReadiness, beginSimulation, cancelPreSimulation, recordResponse, finishSimulation, backToHero, refresh,
  };
}
