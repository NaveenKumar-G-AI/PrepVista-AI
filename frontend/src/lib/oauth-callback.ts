import type { Session } from '@supabase/supabase-js';

export function classifyOAuthFailure(error: unknown): 'terminal' | 'temporary' {
  const failure = error as { code?: string; name?: string; status?: number; message?: string } | null;
  if (['flow_state_not_found', 'flow_state_expired', 'bad_code_verifier', 'invalid_grant',
    'invalid_code', 'access_denied'].includes(failure?.code || '') ||
    failure?.name === 'AuthPKCECodeVerifierMissingError') return 'terminal';
  if (failure?.name === 'AuthRetryableFetchError' ||
    (failure?.status && (failure.status >= 500 || [408, 429].includes(failure.status)))) return 'temporary';
  // Compatibility with older SDK errors that predate structured error codes.
  if (/pkce.*(missing|not found)|code verifier.*(missing|invalid|empty)|flow.*(expired|not found)|code.*(consumed|expired|invalid)/i.test(failure?.message || '')) return 'terminal';
  if (failure?.status && failure.status >= 400 && failure.status < 500) return 'terminal';
  return 'temporary';
}

type CallbackResult = { kind: 'success'; path: string } | { kind: 'fresh-sign-in' } | { kind: 'retry' };
type SessionResult = { data: { session: Session | null }; error?: unknown };

export function createGoogleCallback(deps: {
  code: string | null;
  flowError?: unknown;
  exchangeCode: (code: string) => Promise<SessionResult>;
  getSession: () => Promise<SessionResult>;
  setTokens: (access: string, refresh: string) => void;
  completeLogin: () => Promise<unknown>;
  refreshUser: () => Promise<void>;
  getMe: () => Promise<{ is_admin?: boolean; premium_override?: boolean; is_org_admin?: boolean; org_student?: boolean }>;
}) {
  let session: Session | null = null;
  let tokensStored = false;
  let settled: CallbackResult | null = null;
  let inFlight: Promise<CallbackResult> | null = null;
  const run = async (): Promise<CallbackResult> => {
    try {
      if (deps.flowError) throw deps.flowError;
      if (!session) {
        const result = deps.code ? await deps.exchangeCode(deps.code) : await deps.getSession();
        if (result.error) throw result.error;
        session = result.data.session;
        if (!session) return settled = { kind: 'fresh-sign-in' };
      }
      if (!tokensStored) {
        deps.setTokens(session.access_token, session.refresh_token || '');
        tokensStored = true;
      }
      await deps.completeLogin();
      await deps.refreshUser();
      const me = await deps.getMe();
      return settled = { kind: 'success', path: me.is_admin || me.premium_override ? '/admin' : me.is_org_admin ? '/org-admin' : me.org_student ? '/student-dashboard' : '/dashboard' };
    } catch (error) {
      if (classifyOAuthFailure(error) === 'terminal') return settled = { kind: 'fresh-sign-in' };
      return { kind: 'retry' };
    }
  };
  return () => {
    if (settled) return Promise.resolve(settled);
    if (inFlight) return inFlight;
    inFlight = run().finally(() => { inFlight = null; });
    return inFlight;
  };
}
