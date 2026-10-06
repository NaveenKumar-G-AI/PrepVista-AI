/**
 * PrepVista — Supabase Client (Frontend)
 * Used for Google OAuth and session management on the client side.
 * Lazy-initialized to avoid build-time errors when env vars are not set.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { classifyOAuthFailure } from './oauth-callback';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // The callback owns code exchange and retry. Keep implicit/hash URL
        // detection; prevent SDK initialization from consuming a code first.
        detectSessionInUrl: !(typeof window !== 'undefined' &&
          window.location.pathname === '/auth/callback' &&
          new URL(window.location.href).searchParams.has('code')),
      },
    });
  }
  return _supabase;
}

export async function exchangeGoogleCode(code: string) {
  const verifierKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token-code-verifier`;
  const verifier = localStorage.getItem(verifierKey);
  if (!verifier) {
    throw Object.assign(new Error('Start a fresh Google sign-in.'), { name: 'AuthPKCECodeVerifierMissingError' });
  }
  try {
    const result = await getSupabase().auth.exchangeCodeForSession(code);
    if (result.error) throw result.error;
    return result;
  } catch (error) {
    // The installed SDK removes the verifier even on retryable exchange
    // errors. Restore only this attempt's verifier, without replacing a
    // newer flow. Never log the verifier or authorization code.
    if (classifyOAuthFailure(error) === 'temporary' && !localStorage.getItem(verifierKey)) {
      localStorage.setItem(verifierKey, verifier);
    }
    throw error;
  }
}

// Backward-compatible export — only use in client components.
// Reuses the lazy singleton from getSupabase() instead of calling createClient()
// a second time. Creating two clients spins up two GoTrueClient instances against
// the same storage key, which logs "Multiple GoTrueClient instances detected" and
// can cause undefined auth behaviour under concurrent use.
export const supabase = (typeof window !== 'undefined' && supabaseUrl && supabaseAnonKey)
  ? getSupabase()
  : (null as unknown as SupabaseClient);
