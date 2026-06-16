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

export interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
  user?: {
    id: string;
    email: string;
  };
}

export interface SignupCodeResponse {
  status: string;
  message: string;
  expires_in_seconds?: number;
}

export interface OAuthCompleteResponse {
  status: string;
  message: string;
}

export interface ApiOptions {
  method?: RequestInit['method'];
  body?: BodyInit | Record<string, unknown> | null;
  headers?: Record<string, string>;
  isFormData?: boolean;
  retries?: number;
  timeoutMs?: number;
}

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  lastAccessed: number; // ✅ ADDED: LRU tracking — FIFO eviction was evicting hot entries
}
