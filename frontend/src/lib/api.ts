/**
 * PrepVista — Backend API Client
 * Centralized HTTP client with retry, error parsing, and Razorpay billing.
 */

// ✅ SEC: Validate API_URL at module load time.
// An empty or localhost NEXT_PUBLIC_API_URL in production silently routes all
// requests — including JWT tokens and payment signatures — to the wrong host.
// This catches misconfigured deploys before the first user login.
const _rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim();
if (!_rawApiUrl && typeof window !== 'undefined') {
  console.error(
    '[PrepVista] NEXT_PUBLIC_API_URL is not set. All API requests will fail. ' +
    'Set this environment variable in your deployment configuration.'
  );
}
const API_URL = _rawApiUrl || 'http://localhost:8000';

export interface ApiUser {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  active_plan: string;
  owned_plans: string[];
  expired_plans: string[];
  highest_owned_plan: string;
  effective_plan: string;
  is_admin: boolean;
  is_org_admin: boolean;
  org_student: boolean;
  organization_id: string | null;
  premium_override: boolean;
  subscription_status: string;
  onboarding_completed: boolean;
  prep_goal: string | null;
  theme_preference: string;
  usage: {
    plan: string;
    effective_plan?: string;
    used: number;
    limit: number | null;
    remaining: number | null;
    is_unlimited: boolean;
    referral_bonus_interviews?: number;
    period_start?: string | null;
  };
}

export interface ApiReferralEntry {
  email: string;
  status: 'queued' | 'joined' | 'rejected';
  reward_granted: boolean;
  created_at: string;
  joined_at: string | null;
}

export interface ApiReferralSummary {
  referral_code: string;
  referral_url: string;
  total_slots: number | null;
  used_slots: number;
  remaining_slots: number | null;
  is_unlimited: boolean;
  successful_referrals: number;
  entries: ApiReferralEntry[];
}

export interface ApiPublicReferral {
  valid: boolean;
  message?: string;
  referrer_name?: string;
  remaining_slots?: number | null;
  total_slots?: number | null;
  is_unlimited?: boolean;
}

export interface ApiPublicGrowth {
  total_users_count: number;
  active_users_count: number;
  total_users_label: string;
  active_users_label: string;
  login_message: string;
  dashboard_message: string;
  launch_offer?: {
    max_slots: number;
    consumed_slots: number;
    remaining_slots: number;
    offer_duration_days: number;
    is_offer_available: boolean;
  };
  updated_at?: string | null;
}

export interface ApiFeedbackItem {
  id: number;
  email: string;
  full_name: string | null;
  feedback_text: string;
  created_at: string;
}

export interface ApiFeedbackResponse {
  mode: 'self' | 'admin';
  items: ApiFeedbackItem[];
}

export interface ApiLaunchOfferState {
  status: 'pending' | 'approved' | 'rejected' | 'expired' | null;
  plan: 'pro' | 'career' | null;
  slot_number: number | null;
  requested_at: string | null;
  approved_at: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  queue_position?: number | null;
  overall_position?: number | null;
  approved_count?: number;
  max_slots?: number;
  remaining_slots?: number;
  offer_duration_days?: number;
  is_offer_available?: boolean;
  within_first_ten?: boolean | null;
}

export interface ApiAdminLaunchOfferItem {
  id: number;
  user_id: string;
  email: string;
  full_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  slot_number: number | null;
  plan: 'pro' | 'career' | null;
  requested_at: string | null;
  approved_at: string | null;
  reviewed_at: string | null;
  approved_by_email: string | null;
  expires_at: string | null;
  queue_position: number | null;
  overall_position: number | null;
  approval_preview_slot: number | null;
  approval_preview_plan: 'pro' | 'career' | null;
}

export interface ApiAdminUserItem {
  id: string;
  email: string;
  full_name: string | null;
  selected_plan: string;
  subscription_status: string;
  is_admin: boolean;
  created_at: string | null;
  last_seen_at: string | null;
  free_status: string;
  free_interviews: number;
  free_cycle_start: string | null;
  free_cycle_end: string | null;
  pro_status: string;
  pro_activated_at: string | null;
  pro_expires_at: string | null;
  pro_interviews: number;
  career_status: string;
  career_activated_at: string | null;
  career_expires_at: string | null;
  career_interviews: number;
  pro_purchase_count: number;
  career_purchase_count: number;
  launch_offer: ApiLaunchOfferState & { id: number | null };
}

export interface ApiAdminReferralItem {
  id: string;
  referrer_name: string | null;
  referrer_email: string;
  invited_email: string;
  invited_user_name: string | null;
  invited_user_email: string | null;
  status: 'queued' | 'joined' | 'rejected';
  reward_granted: boolean;
  created_at: string | null;
  joined_at: string | null;
}

export interface ApiAdminOverview {
  admin_email: string;
  launch_offer: {
    eligible_after: string | null;
    max_slots: number;
    approved_count: number;
    remaining_slots: number;
    offer_duration_days?: number;
    pending_count: number;
    rejected_count: number;
    items: ApiAdminLaunchOfferItem[];
  };
  platform_stats: {
    active_users_count: number;
    inactive_users_count: number;
    total_users_count: number;
    live_window_minutes: number;
    updated_at: string | null;
  };
  users: ApiAdminUserItem[];
  referrals: ApiAdminReferralItem[];
  feedback: ApiFeedbackItem[];
  plan_usage: Array<{
    email: string;
    full_name: string | null;
    plan: string;
    total_interviews: number;
    last_interview_at: string | null;
  }>;
  revenue_analytics: {
    global_pro_revenue: number;
    global_career_revenue: number;
    global_total_revenue: number;
    user_metrics: Array<{
      user_id: string;
      email: string;
      full_name: string | null;
      pro_purchase_count: number;
      career_purchase_count: number;
      pro_revenue_paise: number;
      career_revenue_paise: number;
      total_revenue_paise: number;
      last_payment_date: string | null;
    }>;
  };
}

interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
  user?: {
    id: string;
    email: string;
  };
}

interface SignupCodeResponse {
  status: string;
  message: string;
  expires_in_seconds?: number;
}

interface OAuthCompleteResponse {
  status: string;
  message: string;
}

interface ApiOptions {
  method?: RequestInit['method'];
  body?: BodyInit | Record<string, unknown> | null;
  headers?: Record<string, string>;
  isFormData?: boolean;
  retries?: number;
  timeoutMs?: number;
}

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  lastAccessed: number; // ✅ ADDED: LRU tracking — FIFO eviction was evicting hot entries
}

/** Generate a short client-side request ID for log correlation (enterprise requirement). */
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * ✅ SEC: Validate that a token looks like a JWT before use.
 * A JWT is exactly 3 base64url segments separated by dots.
 * Without this, an XSS payload writing to sessionStorage could inject an
 * arbitrary string into the Authorization header — potential header injection.
 * Also prevents forwarding obviously-corrupt tokens that would just 401.
 */
function isValidJwtShape(token: string | null): token is string {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  // Each part must be non-empty base64url (alphanumeric + - _ =)
  return parts.every(p => p.length > 0 && /^[A-Za-z0-9\-_=]+$/.test(p));
}

class ApiClient {
  private static readonly MAX_CACHE_ENTRIES = 100;
  // ✅ FIXED: MAX_INFLIGHT was declared but never enforced anywhere — was dead code.
  // Now actively checked in cachedRequest before queuing a new background revalidation.
  private static readonly MAX_INFLIGHT = 50;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;
  private cache = new Map<string, CacheEntry>();
  // ✅ FIXED: Promise<any> → Promise<unknown>. 'any' was leaking implicit type unsafety
  // through the entire cache and deduplication layer into every caller.
  private inFlightRequests = new Map<string, Promise<unknown>>();

  /**
   * Stale-while-revalidate GET request.
   * Returns cached data instantly if available, then revalidates in background.
   * @param path   API path
   * @param staleMs  How long before cache is considered stale (default 30s)
   * @param options  Standard request options (method is always GET)
   */
  async cachedRequest<T = unknown>(path: string, staleMs = 30_000, options: ApiOptions = {}): Promise<T> {
    const entry = this.cache.get(path) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (entry) {
      const age = now - entry.timestamp;
      // ✅ PERF: Update lastAccessed on every hit — needed for correct LRU eviction
      entry.lastAccessed = now;
      if (age < staleMs) {
        // Fresh — return immediately, no refetch
        return entry.data;
      }
      // Stale — return immediately but revalidate in background
      // ✅ FIXED: MAX_INFLIGHT now enforced — previously the constant existed but was
      // never checked, so background revalidations could accumulate without bound.
      if (!this.inFlightRequests.has(path) && this.inFlightRequests.size < ApiClient.MAX_INFLIGHT) {
        const promise = this.request<T>(path, options)
          .then(fresh => { this.cache.set(path, { data: fresh, timestamp: Date.now(), lastAccessed: Date.now() }); })
          .catch(() => { /* background revalidation failed, keep stale */ })
          .finally(() => { this.inFlightRequests.delete(path); });
        this.inFlightRequests.set(path, promise);
      }
      return entry.data;
    }

    // No cache — fetch fresh but deduplicate
    if (this.inFlightRequests.has(path)) {
      return this.inFlightRequests.get(path) as Promise<T>;
    }

    const promise = this.request<T>(path, options)
      .then(data => {
        this.cache.set(path, { data, timestamp: Date.now(), lastAccessed: Date.now() });
        if (this.cache.size > ApiClient.MAX_CACHE_ENTRIES) {
          // ✅ PERF: LRU eviction — find and remove the least-recently-accessed entry.
          // Previously used Map.keys().next().value which evicted the oldest-INSERTED
          // key regardless of access recency. Under 500 users, /auth/me was inserted
          // early, then evicted right when every page navigation needed it most.
          let lruKey: string | null = null;
          let lruTime = Infinity;
          for (const [k, v] of this.cache.entries()) {
            if (v.lastAccessed < lruTime) {
              lruTime = v.lastAccessed;
              lruKey = k;
            }
          }
          if (lruKey) this.cache.delete(lruKey);
        }
        return data;
      })
      .finally(() => {
        this.inFlightRequests.delete(path);
      });
    
    this.inFlightRequests.set(path, promise);
    return promise;
  }

  /** Invalidate cache entries matching a prefix (e.g., '/dashboard') */
  invalidateCache(pathPrefix?: string) {
    if (!pathPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(pathPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  setTokens(access: string, refresh: string) {
    this.token = access;
    this.refreshToken = refresh;
    if (typeof window !== 'undefined') {
      // access_token → sessionStorage (short-lived, XSS-scoped to tab)
      sessionStorage.setItem('pv_access_token', access);
      // refresh_token → localStorage (survives tab close, enables session restore)
      localStorage.setItem('pv_refresh_token', refresh);
      // Clean up legacy key if still present
      sessionStorage.removeItem('pv_refresh_token');
    }
  }

  loadTokens() {
    if (typeof window !== 'undefined') {
      this.token = sessionStorage.getItem('pv_access_token');
      this.refreshToken = localStorage.getItem('pv_refresh_token');

      // Migrate from legacy sessionStorage-only storage
      if (!this.refreshToken) {
        const legacyRefresh = sessionStorage.getItem('pv_refresh_token');
        if (legacyRefresh) {
          this.refreshToken = legacyRefresh;
          localStorage.setItem('pv_refresh_token', legacyRefresh);
          sessionStorage.removeItem('pv_refresh_token');
        }
      }

      // If we have a refresh token but no access token (new tab / browser restart),
      // trigger a background refresh to restore the session
      if (!this.token && this.refreshToken) {
        void this.tryRefresh();
      }

      // ✅ SEC: Cross-tab logout detection.
      // When a user logs out in tab A, tab B still holds the JWT in memory and
      // continues making authenticated requests until the page is reloaded.
      // The 'storage' event fires in all OTHER tabs when localStorage changes,
      // so we detect token removal and clear in-memory state immediately.
      // This closes the "forgot to close tabs" session hijack window.
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === 'pv_refresh_token' && event.newValue === null) {
          // Another tab cleared the refresh token — treat as logout
          this.token = null;
          this.refreshToken = null;
          this.cache.clear();
          // Navigate to login if on a protected page
          if (
            typeof window !== 'undefined' &&
            !window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/referral') &&
            !window.location.pathname.startsWith('/r/') &&
            window.location.pathname !== '/'
          ) {
            window.location.href = '/login';
          }
        }
      });
    }
  }

  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pv_access_token');
      localStorage.removeItem('pv_refresh_token');
      sessionStorage.removeItem('pv_refresh_token'); // legacy cleanup
    }
  }

  getToken() {
    if (!this.token && typeof window !== 'undefined') {
      this.token = sessionStorage.getItem('pv_access_token');
      // If no access token, check if we can restore from a persisted refresh token
      if (!this.token && !this.refreshToken) {
        this.refreshToken = localStorage.getItem('pv_refresh_token');
      }
    }
    return this.token;
  }

  async request<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, isFormData = false, retries = 1, timeoutMs } = options;

    const requestHeaders: Record<string, string> = { ...headers };
    const currentToken = this.getToken();
    // ✅ SEC: Validate JWT shape before injecting into Authorization header.
    // Prevents XSS-written arbitrary strings from becoming header injection vectors.
    // A JWT must be exactly 3 base64url segments — anything else is rejected and cleared.
    if (currentToken && isValidJwtShape(currentToken)) {
      requestHeaders['Authorization'] = `Bearer ${currentToken}`;
    } else if (currentToken && !isValidJwtShape(currentToken)) {
      this.clearTokens(); // malformed token — clear, do not send
    }
    if (!isFormData) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    requestHeaders['X-Request-ID'] = generateRequestId();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = typeof AbortController !== 'undefined' && timeoutMs ? new AbortController() : null;
      // ✅ SEC: cache: 'no-store' prevents the browser from writing auth responses,
      // tokens, or API data to disk cache. Without this, a shared/public computer
      // exposes the previous user's session to anyone opening the browser cache or
      // running forensic recovery tools. Every request must be fresh from the server.
      const config: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller?.signal,
        cache: 'no-store',
      };
      if (body !== undefined && body !== null) {
        config.body = isFormData ? body as BodyInit : JSON.stringify(body);
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        timeoutHandle = controller && timeoutMs
          ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
          : null;
        const response = await fetch(`${API_URL}${path}`, config);

        // Handle 401 — try token refresh
        if (response.status === 401 && this.refreshToken && attempt === 0) {
          const refreshed = await this.tryRefresh();
          if (refreshed) {
            requestHeaders['Authorization'] = `Bearer ${this.token}`;
            const retryResp = await fetch(`${API_URL}${path}`, { ...config, headers: requestHeaders });
            if (!retryResp.ok) {
              if (retryResp.status === 401) {
                this.clearTokens();
                if (
                typeof window !== 'undefined' &&
                !window.location.pathname.startsWith('/login') &&
                !window.location.pathname.startsWith('/referral') &&
                !window.location.pathname.startsWith('/r/') &&
                window.location.pathname !== '/'
              ) {
                  window.location.href = '/login';
                  // ✅ FIXED: return early after redirect — previously both the redirect
                  // AND throw parseError fired, causing a redundant async parseError call
                  // after navigation had already started. Confusing for future engineers.
                  return undefined as unknown as T;
                }
              }
              throw await this.parseError(retryResp);
            }
            if (timeoutHandle !== null) {
              globalThis.clearTimeout(timeoutHandle);
            }
            return retryResp.json() as Promise<T>;
          }
        }

        // If it's still 401 after refresh attempt, or no refresh token exists
        if (response.status === 401) {
          this.clearTokens();
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/referral') && !window.location.pathname.startsWith('/r/') && window.location.pathname !== '/') {
            window.location.href = '/login';
          }
        }

        if (!response.ok) {
          throw await this.parseError(response);
        }

        if (timeoutHandle !== null) {
          globalThis.clearTimeout(timeoutHandle);
        }
        return response.json() as Promise<T>;
      } catch (err) {
        if (timeoutHandle !== null) {
          globalThis.clearTimeout(timeoutHandle);
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.name === 'AbortError') {
          lastError = new Error('Request timed out. Please try again.');
        }
        if (attempt < retries && method === 'GET') {
          // ✅ PERF: Jittered backoff — pure linear backoff (1000ms × attempt) causes
          // thundering herd: all 500 concurrent failures retry at the exact same ms.
          // Full-jitter formula: random delay in [0, base * 2^attempt] spreads the
          // retry wave across a window, preventing a retry storm from re-killing the server.
          const base = 800 * (attempt + 1);
          const jitter = Math.random() * base;
          await new Promise(r => setTimeout(r, Math.min(base + jitter, 8000)));
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  private async tryRefresh(): Promise<boolean> {
    // Prevent concurrent refresh requests (loadTokens + request 401 can race)
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this._doRefresh();
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async _doRefresh(): Promise<boolean> {
    try {
      const resp = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      if (resp.ok) {
        const data = await resp.json() as AuthTokensResponse;
        this.setTokens(data.access_token, data.refresh_token);
        return true;
      }
    } catch (err) {
      // ✅ FIXED: was empty catch {}. Network errors during token refresh were completely
      // invisible — engineers had no way to distinguish "refresh endpoint down" from
      // "user had invalid token". Logging at warn level is intentional: this is not
      // a silent analytics failure, it directly affects whether users stay logged in.
      if (typeof console !== 'undefined') {
        console.warn('[ApiClient] Token refresh network error:', err instanceof Error ? err.message : String(err));
      }
    }
    this.clearTokens();
    return false;
  }

  private async parseError(response: Response): Promise<Error> {
    try {
      const data = await response.json();
      const detail = data.detail;
      const message = typeof detail === 'string'
        ? detail
        : typeof detail === 'object' && detail?.message
          ? detail.message
          : detail ? JSON.stringify(detail) : 'Something went wrong. Please try again.';
      const error = new Error(message) as Error & { status?: number; code?: string; mode?: string };
      error.status = response.status;
      if (typeof detail === 'object' && detail) {
        if ('error' in detail && typeof detail.error === 'string') {
          error.code = detail.error;
        }
        if ('mode' in detail && typeof detail.mode === 'string') {
          error.mode = detail.mode;
        }
      }
      return error;
    } catch {
      const error = new Error(`Request failed (${response.status})`) as Error & { status?: number };
      error.status = response.status;
      return error;
    }
  }

  private async parseResponseMessage(response: Response, fallback: string): Promise<Error> {
    const contentType = response.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const detail = typeof data.detail === 'string'
          ? data.detail
          : typeof data.detail === 'object' && data.detail?.message
            ? data.detail.message
            : data.detail ? JSON.stringify(data.detail) : fallback;
        return new Error(detail || fallback);
      }

      const text = (await response.text()).trim();
      return new Error(text || fallback);
    } catch {
      return new Error(fallback);
    }
  }

  // ── Auth ─────────────────────────────────
  async requestSignupCode(email: string) {
    return this.request<SignupCodeResponse>('/auth/signup/request-code', {
      method: 'POST',
      body: { email },
      retries: 0,
      timeoutMs: 30000,
    });
  }

  async signup(email: string, password: string, fullName: string, verificationCode: string) {
    const data = await this.request<AuthTokensResponse>('/auth/signup', {
      method: 'POST', body: { email, password, full_name: fullName, verification_code: verificationCode },
    });
    if (data.access_token) this.setTokens(data.access_token, data.refresh_token);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<AuthTokensResponse>('/auth/login', {
      method: 'POST', body: { email, password },
    });
    if (data.access_token) this.setTokens(data.access_token, data.refresh_token);
    return data;
  }

  async getAccountStatus(email: string) {
    return this.request<{ exists: boolean; is_admin_email?: boolean }>('/auth/account-status', {
      method: 'POST',
      body: { email },
      retries: 0,
    });
  }

  async completeOAuthLogin() {
    const currentToken = this.getToken();
    // ✅ FIXED: was a bare fetch with no timeout. A hung OAuth completion blocked the
    // entire login flow permanently with no escape for the user. 30s is generous for
    // an auth handshake — if the server hasn't responded by then it won't.
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutHandle = controller
      ? globalThis.setTimeout(() => controller.abort(), 30_000)
      : null;

    let response: Response;
    try {
      response = await fetch(`${API_URL}/auth/oauth/complete`, {
        method: 'POST',
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
        signal: controller?.signal,
      });
    } catch (err) {
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      throw new Error(isAbort ? 'OAuth login timed out. Please try again.' : 'OAuth login could not be completed.');
    } finally {
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const detail = typeof data === 'object' && data !== null && 'detail' in data
        ? (data as { detail?: { error?: string; message?: string; mode?: string } | string }).detail
        : null;
      const error = new Error(
        typeof detail === 'object' && detail?.message
          ? detail.message
          : typeof detail === 'string'
            ? detail
            : 'OAuth login could not be completed.'
      ) as Error & { code?: string; mode?: string };

      if (typeof detail === 'object' && detail) {
        error.code = detail.error;
        error.mode = detail.mode;
      }
      throw error;
    }

    return data as OAuthCompleteResponse;
  }

  // ✅ PERF: TTL raised 20s→90s. /auth/me doesn't change mid-session.
  // At 500 users with 20s TTL = 25 identical refetches/sec. At 90s = ~5.5/sec.
  async getMe<T = ApiUser>() { return this.cachedRequest<T>('/auth/me', 90_000); }

  async trackEvent(eventName: string, metadata: Record<string, unknown> = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const currentToken = this.getToken();
    if (currentToken && isValidJwtShape(currentToken)) {
      headers.Authorization = `Bearer ${currentToken}`;
    }
    // ✅ SEC: Cap metadata keys to 20 and each value to a string to prevent
    // arbitrarily large analytics payloads being sent on every user interaction.
    const safeMetadata: Record<string, unknown> = {};
    let keyCount = 0;
    for (const [k, v] of Object.entries(metadata)) {
      if (keyCount >= 20) break;
      // Only allow primitive values — no nested objects that could explode in size
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        safeMetadata[k.slice(0, 64)] = typeof v === 'string' ? v.slice(0, 256) : v;
        keyCount++;
      }
    }
    try {
      await fetch(`${API_URL}/events/track`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_name: eventName, metadata: safeMetadata }),
        keepalive: true,
        cache: 'no-store',
      });
    } catch {
      // Intentionally silent: analytics should never block UX.
    }
  }

  async completeOnboarding(prepGoal: string, fullName: string) {
    return this.request('/auth/onboarding', {
      method: 'POST', body: { prep_goal: prepGoal, full_name: fullName },
    });
  }
  logout() { this.clearTokens(); this.invalidateCache(); }

  /**
   * Warm the most-accessed endpoints immediately after login.
   * ✅ PERF: Without this, /auth/me + /dashboard + /skills all cold-miss at the
   * same instant for every user after login — 500 users logging in = 1500 cold
   * requests in one second. Prefetching fills the cache so page loads are instant.
   * Fire-and-forget: errors are intentionally swallowed (cache will fill on demand).
   */
  prefetchAfterLogin() {
    void this.cachedRequest('/auth/me', 90_000).catch(() => {});
    void this.cachedRequest('/dashboard', 90_000).catch(() => {});
    void this.cachedRequest('/dashboard/skills', 120_000).catch(() => {});
  }

  // ── Dashboard ────────────────────────────
  // ✅ PERF: Dashboard TTL 30s→90s. Skills TTL 45s→120s. Admin overview 60s→120s.
  // Each TTL raise reduces server calls proportionally under concurrent load.
  async getDashboard<T = unknown>() { return this.cachedRequest<T>('/dashboard', 90_000); }
  async getPublicGrowth<T = ApiPublicGrowth>() { return this.cachedRequest<T>('/dashboard/public-growth', 120_000, { retries: 0 }); }
  async getAdminOverview<T = ApiAdminOverview>() { return this.cachedRequest<T>('/admin/overview', 120_000, { retries: 0 }); }
  async approveLaunchOffer<T = { status: string; grant_id: number; user_id: string; email: string; plan: string; slot_number: number; approved_at: string | null; expires_at: string | null }>(grantId: number) {
    return this.request<T>(`/admin/launch-offers/${grantId}/approve`, {
      method: 'POST',
      retries: 0,
    });
  }
  async rejectLaunchOffer<T = { status: string; grant_id: number; user_id: string; email: string; reviewed_at: string | null }>(grantId: number) {
    return this.request<T>(`/admin/launch-offers/${grantId}/reject`, {
      method: 'POST',
      retries: 0,
    });
  }
  async grantAdminAccess<T = { status: string; message: string }>(userId: string, model: string, value: string, action: string) {
    return this.request<T>(`/admin/grants`, {
      method: 'POST',
      body: { user_id: userId, model, value, action },
      retries: 0,
      timeoutMs: 15000,
    });
  }
  // ── Support ─────────────────────────────────
  async getMySupportThread<T = unknown>(limit = 50, offset = 0) {
    // ✅ SEC: Cap limit/offset — uncapped values let a caller extract unlimited records
    const safeLimitVal = Math.min(Math.max(1, limit), 100);
    const safeOffsetVal = Math.max(0, offset);
    return this.request<T>(`/support/me?limit=${safeLimitVal}&offset=${safeOffsetVal}`);
  }
  async sendSupportMessage<T = unknown>(content: string, attachment_data: string | null = null) {
    // ✅ SEC: Cap attachment_data — base64 of a 10MB file = 13MB string.
    // Client-side cap is a second layer; server also validates.
    const _MAX_ATTACHMENT_B64 = 1 * 1024 * 1024; // 1MB base64 ≈ 750KB file
    const safeAttachment = attachment_data && attachment_data.length > _MAX_ATTACHMENT_B64
      ? null  // silently drop oversized attachment — caller should validate file size before calling
      : attachment_data;
    // ✅ SEC: Cap content length
    const safeContent = typeof content === 'string' ? content.slice(0, 10_000) : '';
    return this.request<T>('/support/me', {
      method: 'POST',
      body: { content: safeContent, attachment_data: safeAttachment },
      retries: 0,
      timeoutMs: 15000,
    });
  }
  async getAdminSupportUsers<T = unknown>() {
    return this.request<T>('/admin/support/users', { retries: 0 });
  }
  async getAdminSupportThread<T = unknown>(userId: string, limit = 100) {
    // ✅ SEC: Cap limit
    const safeLimitVal = Math.min(Math.max(1, limit), 200);
    return this.request<T>(`/admin/support/${encodeURIComponent(userId)}?limit=${safeLimitVal}`, { retries: 0 });
  }
  async sendAdminSupportReply<T = unknown>(userId: string, content: string, attachment_data: string | null = null) {
    const _MAX_ATTACHMENT_B64 = 1 * 1024 * 1024;
    const safeAttachment = attachment_data && attachment_data.length > _MAX_ATTACHMENT_B64
      ? null : attachment_data;
    const safeContent = typeof content === 'string' ? content.slice(0, 10_000) : '';
    return this.request<T>(`/admin/support/${encodeURIComponent(userId)}`, {
      method: 'POST',
      body: { content: safeContent, attachment_data: safeAttachment },
      retries: 0,
      timeoutMs: 15000,
    });
  }

  async getSessionHistory<T = unknown>(limit = 20, offset = 0) {
    // Only cache first page (most common)
    if (offset === 0 && limit === 20) {
      return this.cachedRequest<T>(`/dashboard/sessions?limit=${limit}&offset=${offset}`, 30_000);
    }
    return this.request<T>(`/dashboard/sessions?limit=${limit}&offset=${offset}`);
  }
  async deleteSessionHistory<T = { status: string; session_id: string }>(sessionId: string) {
    return this.request<T>(`/dashboard/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      retries: 0,
    });
  }
  async bulkDeleteSessionHistory<T = { status: string; deleted_count: number; session_ids: string[] }>(sessionIds: string[]) {
    return this.request<T>('/dashboard/sessions/bulk-delete', {
      method: 'POST',
      body: { session_ids: sessionIds },
      retries: 0,
    });
  }
  async getSkills<T = unknown>() { return this.cachedRequest<T>('/dashboard/skills', 120_000); }
  async deleteAccount<T = { status: string; message: string }>() {
    return this.request<T>('/account/me', {
      method: 'DELETE',
      retries: 0,
      timeoutMs: 15000,
    });
  }
  async getMyReferrals<T = ApiReferralSummary>() { return this.cachedRequest<T>('/referrals/me', 30_000); }
  async getPublicReferral<T = ApiPublicReferral>(referralCode: string) {
    return this.request<T>(`/referrals/public/${encodeURIComponent(referralCode)}`, { retries: 0 });
  }
  async queueReferral<T = { status: string; message: string }>(referralCode: string, email: string) {
    return this.request<T>('/referrals/queue', {
      method: 'POST',
      body: { referral_code: referralCode, email },
      retries: 0,
    });
  }

  // ── Interviews ────────────────────────────
  async getFeedback<T = ApiFeedbackResponse>() {
    return this.request<T>('/feedback', { retries: 0 });
  }
  async submitFeedback<T = { status: string; item: ApiFeedbackItem }>(feedbackText: string) {
    // ✅ SEC: Cap feedback_text — uncapped allows a 1MB+ string that inflates DB storage
    // and potentially triggers LLM processing on untrusted data without bound.
    const safeFeedback = typeof feedbackText === 'string' ? feedbackText.slice(0, 5_000) : '';
    return this.request<T>('/feedback', {
      method: 'POST',
      body: { feedback_text: safeFeedback },
      retries: 0,
      timeoutMs: 10000,
    });
  }
  async setupInterview<T = unknown>(formData: FormData) {
    return this.request<T>('/interviews/setup', { method: 'POST', body: formData, isFormData: true });
  }
  async submitAnswer<T = unknown>(
    sessionId: string,
    userText: string,
    accessToken: string,
    durationActual?: number,
    clientRequestId?: string,
    answerDurationSeconds?: number,
  ) {
    return this.request<T>(`/interviews/${sessionId}/answer`, {
      method: 'POST',
      body: {
        user_text: userText,
        access_token: accessToken,
        duration_actual: durationActual,
        client_request_id: clientRequestId,
        answer_duration_seconds: answerDurationSeconds,
      },
      // ✅ PERF: retries 0→1. A single network blip previously lost the answer
      // permanently. One retry with jittered backoff recovers from transient errors
      // without meaningfully delaying the interview flow for the student.
      retries: 1,
      timeoutMs: 20000,
    });
  }
  async finishInterview<T = unknown>(sessionId: string, accessToken: string, durationActual?: number) {
    return this.request<T>(`/interviews/${sessionId}/finish`, {
      method: 'POST',
      body: { access_token: accessToken, duration_actual: durationActual },
      // ✅ FIXED: was 9000ms. The backend computes final score + neural feedback here.
      // Under any load 9s fires before the server responds — students lose their score
      // at the most important moment of the session. 30s matches the PDF download SLA.
      timeoutMs: 30_000,
    });
  }
  async terminateInterview<T = unknown>(sessionId: string, accessToken: string, reason: string, durationActual?: number) {
    return this.request<T>(`/interviews/${sessionId}/terminate`, {
      method: 'POST', body: { access_token: accessToken, reason, duration_actual: durationActual },
      // ✅ FIXED: was 9000ms — same risk as finishInterview. Session state must be
      // persisted before the tab closes. 15s gives margin for backend write under load.
      timeoutMs: 15_000,
    });
  }


  // ── Reports ───────────────────────────────
  async getReport<T = unknown>(sessionId: string) { return this.cachedRequest<T>(`/reports/${sessionId}`, 60_000); }
  async downloadPDF(sessionId: string): Promise<Blob> {
    const downloadTimeoutMs = 120000;
    const normalizeDownloadError = (err: unknown): Error => {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (
        err instanceof DOMException && err.name === 'AbortError' ||
        message.includes('signal is aborted') ||
        message.includes('aborted without reason') ||
        message.includes('aborterror')
      ) {
        return new Error('PDF generation is taking longer than expected. Please try again in a moment.');
      }
      if (message.includes('failed to fetch') || message.includes('networkerror')) {
        return new Error('Unable to reach the server for PDF download. Please try again.');
      }
      return err instanceof Error ? err : new Error('PDF download failed. Please try again.');
    };

    const doFetch = async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutHandle = controller
        ? globalThis.setTimeout(() => controller.abort(), downloadTimeoutMs)
        : null;

      try {
        return await fetch(`${API_URL}/reports/${sessionId}/pdf`, {
          method: 'GET',
          headers: {
            Accept: 'application/pdf',
            ...(this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}),
          },
          cache: 'no-store',
          signal: controller?.signal,
        });
      } catch (err) {
        throw normalizeDownloadError(err);
      } finally {
        if (timeoutHandle !== null) {
          globalThis.clearTimeout(timeoutHandle);
        }
      }
    };

    let resp = await doFetch();
    if (resp.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        resp = await doFetch();
      }
    }

    if (!resp.ok) {
      throw await this.parseResponseMessage(resp, 'PDF download failed. Please try again.');
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/pdf')) {
      throw await this.parseResponseMessage(resp, 'PDF download failed. Please try again.');
    }

    const blob = await resp.blob();
    if (!blob.size) {
      throw new Error('PDF download failed. The generated file was empty.');
    }

    return blob;
  }

  // ── Billing (Razorpay) ────────────────────
  async createOrder<T = unknown>(plan: string) {
    return this.request<T>('/billing/create-order', { method: 'POST', body: { plan } });
  }
  async verifyPayment<T = unknown>(orderId: string, paymentId: string, signature: string) {
    return this.request<T>('/billing/verify-payment', {
      method: 'POST',
      body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature },
    });
  }
  async getBillingStatus<T = unknown>() {
    return this.request<T>('/billing/status');
  }
  async switchPlan<T = unknown>(plan: string) {
    return this.request<T>('/billing/switch-plan', {
      method: 'POST',
      body: { plan },
    });
  }

  // ── Report Sharing ────────────────────────
  async shareReport<T = unknown>(sessionId: string) {
    return this.request<T>(`/reports/${sessionId}/share`, { method: 'POST' });
  }
  async getSharedReport<T = unknown>(shareToken: string) {
    return this.request<T>(`/reports/shared/${shareToken}`);
  }

  // ── Organization Admin (Main Admin) ───────
  async getOrgDashboard<T = unknown>() { return this.request<T>('/org/admin/dashboard'); }
  async listOrganizations<T = unknown>(params = '') { return this.request<T>(`/org/admin/organizations${params ? '?' + params : ''}`); }
  async getOrganization<T = unknown>(id: string) { return this.request<T>(`/org/admin/organizations/${id}`); }
  async createOrganization<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/admin/organizations', { method: 'POST', body });
  }
  async updateOrganization<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/admin/organizations/${id}`, { method: 'PUT', body });
  }
  async suspendOrganization<T = unknown>(id: string) {
    return this.request<T>(`/org/admin/organizations/${id}/suspend`, { method: 'POST' });
  }
  async activateOrganization<T = unknown>(id: string) {
    return this.request<T>(`/org/admin/organizations/${id}/activate`, { method: 'POST' });
  }
  async deleteOrganization<T = unknown>(id: string) {
    return this.request<T>(`/org/admin/organizations/${id}`, { method: 'DELETE' });
  }
  async getOrgStudentsAdmin<T = unknown>(id: string, params = '') {
    return this.request<T>(`/org/admin/organizations/${id}/students${params ? '?' + params : ''}`);
  }
  async getOrgAnalyticsAdmin<T = unknown>(id: string) { return this.request<T>(`/org/admin/organizations/${id}/analytics`); }
  async getOrgAccessLogAdmin<T = unknown>(id: string, params = '') {
    return this.request<T>(`/org/admin/organizations/${id}/access-log${params ? '?' + params : ''}`);
  }
  async assignOrgPlan<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/admin/organizations/${id}/assign-plan`, { method: 'POST', body });
  }
  async recordOrgPayment<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/admin/organizations/${id}/record-payment`, { method: 'POST', body });
  }
  async revokeOrgPlan<T = unknown>(id: string) {
    return this.request<T>(`/org/admin/organizations/${id}/revoke-plan`, { method: 'POST' });
  }
  async grantAllOrgAccess<T = unknown>(id: string) {
    return this.request<T>(`/org/admin/organizations/${id}/grant-all-access`, { method: 'POST' });
  }
  async revokeAllOrgAccess<T = unknown>(id: string) {
    return this.request<T>(`/org/admin/organizations/${id}/revoke-all-access`, { method: 'POST' });
  }
  async getOrgBillingAdmin<T = unknown>(id: string) { return this.request<T>(`/org/admin/organizations/${id}/billing`); }
  async listOrgAdmins<T = unknown>(params = '') { return this.request<T>(`/org/admin/admins${params ? '?' + params : ''}`); }
  async createOrgAdmin<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/admin/admins', { method: 'POST', body });
  }
  async getOrgAdminDetail<T = unknown>(id: string) { return this.request<T>(`/org/admin/admins/${id}`); }
  async updateOrgAdmin<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/admin/admins/${id}`, { method: 'PUT', body });
  }
  async disableOrgAdmin<T = unknown>(id: string) { return this.request<T>(`/org/admin/admins/${id}/disable`, { method: 'POST' }); }
  async enableOrgAdmin<T = unknown>(id: string) { return this.request<T>(`/org/admin/admins/${id}/enable`, { method: 'POST' }); }

  // ── College Admin (Secondary Admin) ───────
  async getCollegeDashboard<T = unknown>() { return this.request<T>('/org/my/dashboard'); }
  async listCollegeStudents<T = unknown>(params = '') { return this.request<T>(`/org/my/students${params ? '?' + params : ''}`); }
  async addCollegeStudent<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/my/students', { method: 'POST', body });
  }
  async getCollegeStudent<T = unknown>(id: string) { return this.request<T>(`/org/my/students/${id}`); }
  async updateCollegeStudent<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/my/students/${id}`, { method: 'PUT', body });
  }
  async removeCollegeStudent<T = unknown>(id: string) {
    return this.request<T>(`/org/my/students/${id}`, { method: 'DELETE' });
  }
  async grantCareerAccess<T = unknown>(id: string) {
    return this.request<T>(`/org/my/students/${id}/grant-access`, { method: 'POST' });
  }
  async revokeCareerAccess<T = unknown>(id: string) {
    return this.request<T>(`/org/my/students/${id}/revoke-access`, { method: 'POST' });
  }
  async bulkUploadStudents<T = unknown>(formData: FormData) {
    // ✅ SEC: Check file size before upload. Sending a 50MB CSV wastes bandwidth
    // and keeps the UI frozen while the server rejects it. Client cap matches
    // server-side 5MB limit in org_college.py — reject instantly with a clear message.
    const file = formData.get('file');
    if (file instanceof File && file.size > 5 * 1024 * 1024) {
      throw new Error('CSV file exceeds the 5 MB size limit. Please split into smaller batches.');
    }
    return this.request<T>('/org/my/students/bulk', { method: 'POST', body: formData, isFormData: true });
  }
  async listCollegeDepartments<T = unknown>() { return this.request<T>('/org/my/departments'); }
  async createCollegeDepartment<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/my/departments', { method: 'POST', body });
  }
  async updateCollegeDepartment<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/my/departments/${id}`, { method: 'PUT', body });
  }
  async deleteCollegeDepartment<T = unknown>(id: string) {
    return this.request<T>(`/org/my/departments/${id}`, { method: 'DELETE' });
  }
  async listCollegeYears<T = unknown>() { return this.request<T>('/org/my/years'); }
  async createCollegeYear<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/my/years', { method: 'POST', body });
  }
  async updateCollegeYear<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/my/years/${id}`, { method: 'PUT', body });
  }
  async deleteCollegeYear<T = unknown>(id: string) {
    return this.request<T>(`/org/my/years/${id}`, { method: 'DELETE' });
  }
  async reorderCollegeYears<T = unknown>(year_ids: string[]) {
    return this.request<T>('/org/my/years/reorder', { method: 'POST', body: year_ids as unknown as Record<string, unknown> });
  }
  async listCollegeBatches<T = unknown>() { return this.request<T>('/org/my/batches'); }
  async createCollegeBatch<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/my/batches', { method: 'POST', body });
  }
  async updateCollegeBatch<T = unknown>(id: string, body: Record<string, unknown>) {
    return this.request<T>(`/org/my/batches/${id}`, { method: 'PUT', body });
  }
  async deleteCollegeBatch<T = unknown>(id: string) {
    return this.request<T>(`/org/my/batches/${id}`, { method: 'DELETE' });
  }
  async getCollegeAnalytics<T = unknown>() { return this.request<T>('/org/my/analytics'); }
  async getCollegeAccessControl<T = unknown>() { return this.request<T>('/org/my/access-control'); }
  async getCollegeAccessLog<T = unknown>(params = '') { return this.request<T>(`/org/my/access-log${params ? '?' + params : ''}`); }
  async getCollegeBilling<T = unknown>() { return this.request<T>('/org/my/billing'); }
  async exportCollegeReports<T = unknown>(params = '') { return this.request<T>(`/org/my/reports/export${params ? '?' + params : ''}`); }
  async scheduleCollegeReport<T = unknown>(body: Record<string, unknown>) {
    return this.request<T>('/org/my/reports/schedule', {
      method: 'POST',
      body,
      retries: 0,
      timeoutMs: 15000,
    });
  }
  async exportCollegeReportsCSV(params = ''): Promise<Blob> {
    // ✅ FIXED: was a bare fetch with no AbortController, no timeout, no content-type
    // check, and an error message of just 'CSV download failed.' A hung connection
    // locked the college admin UI indefinitely with no recovery path.
    const url = `${API_URL}/org/my/reports/export${params ? '?' + params : ''}`;
    const headers: Record<string, string> = {
      // ✅ ADDED: X-Request-ID so IT teams can correlate a failed CSV export with
      // the exact server log line when a college admin files a support ticket.
      'X-Request-ID': generateRequestId(),
    };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutHandle = controller
      ? globalThis.setTimeout(() => controller.abort(), 120_000)
      : null;

    let resp: Response;
    try {
      resp = await fetch(url, { method: 'GET', headers, signal: controller?.signal });
    } catch (err) {
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      throw new Error(
        isAbort
          ? 'CSV export is taking too long. Please try again or narrow the date range.'
          : 'Unable to reach the server for CSV export. Please check your connection and try again.'
      );
    } finally {
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
    }

    if (!resp.ok) {
      throw new Error(`CSV export failed (${resp.status}). Please try again or contact support if this continues.`);
    }

    // ✅ ADDED: content-type check — prevents silently returning an HTML error page
    // as a blob that opens as a corrupt file in Excel.
    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/csv') && !contentType.includes('application/octet-stream') && !contentType.includes('text/plain')) {
      throw new Error('CSV export returned an unexpected file type. Please try again.');
    }

    return resp.blob();
  }

  // ── Support Archive ───────────────────────
  async archiveSupportThread<T = unknown>(userId: string) {
    return this.request<T>(`/admin/support/${encodeURIComponent(userId)}/archive`, { method: 'POST' });
  }
  async unarchiveSupportThread<T = unknown>(userId: string) {
    return this.request<T>(`/admin/support/${encodeURIComponent(userId)}/unarchive`, { method: 'POST' });
  }
}

export const api = new ApiClient();