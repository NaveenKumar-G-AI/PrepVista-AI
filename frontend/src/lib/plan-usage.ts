export interface PlanUsage {
  plan: string;
  effective_plan?: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  is_unlimited?: boolean;
  referral_bonus_interviews?: number;
  period_start?: string | null;
}

const PLAN_LIMITS: Record<string, number | null> = {
  free: 2,
  pro: 15,
  career: null,
};

export function getPlanInterviewLimit(plan: string, referralBonusInterviews = 0) {
  const normalized = (plan || 'free').toLowerCase();
  const baseLimit = PLAN_LIMITS[normalized] ?? PLAN_LIMITS.free;
  if (baseLimit === null) {
    return null;
  }
  return baseLimit + Math.max(0, referralBonusInterviews || 0);
}

export function deriveUsageForPlan(
  usage: PlanUsage | null | undefined,
  selectedPlan: string,
): (PlanUsage & { is_unlimited: boolean }) | undefined {
  if (!usage) {
    return undefined;
  }
  const normalizedPlan = (selectedPlan || usage.plan || 'free').toLowerCase();
  const referralBonusInterviews = usage.referral_bonus_interviews ?? 0;
  const limit = getPlanInterviewLimit(normalizedPlan, referralBonusInterviews);
  const isUnlimited = limit === null;

  return {
    ...usage,
    plan: normalizedPlan,
    limit,
    remaining: isUnlimited ? null : Math.max(0, (limit ?? 0) - (usage.used ?? 0)),
    is_unlimited: isUnlimited,
  };
}

export function isUnlimitedUsage(usage?: PlanUsage | null) {
  return Boolean(usage?.is_unlimited || usage?.plan === 'career' || usage?.limit === null);
}

export function hasRemainingUsage(usage?: PlanUsage | null) {
  return isUnlimitedUsage(usage) || (usage?.remaining ?? 0) > 0;
}

export function getStartInterviewHref(usage?: PlanUsage | null) {
  return hasRemainingUsage(usage) ? '/interview/setup' : '/pricing';
}

export function getPlanLimitLabel(usage?: PlanUsage | null) {
  if (!usage) {
    return 'Loading plan usage';
  }
  if (isUnlimitedUsage(usage)) {
    return 'Unlimited interviews active';
  }
  return `${usage.remaining ?? 0} left of ${usage.limit ?? 0}`;
}

export function getUsageHeadline(usage?: PlanUsage | null) {
  if (!usage) {
    return 'Checking your current interview capacity.';
  }
  if (isUnlimitedUsage(usage)) {
    return 'Career mode is active with unlimited interviews.';
  }
  if ((usage.remaining ?? 0) === 0) {
    return `No interviews left on your selected ${usage.plan.toUpperCase()} plan.`;
  }
  return `${usage.remaining ?? 0} interview${usage.remaining === 1 ? '' : 's'} remaining on ${usage.plan.toUpperCase()}.`;
}

export function getLowLimitNotice(usage?: PlanUsage | null) {
  if (!usage || isUnlimitedUsage(usage)) {
    return null;
  }
  const remaining = usage.remaining ?? 0;
  if (remaining > 3) {
    return null;
  }
  if (remaining === 0) {
    return 'No interviews remain on this selected plan. Starting another interview will take you to Pricing so you can restore access or switch tiers.';
  }
  return `Only ${remaining} interview${remaining === 1 ? '' : 's'} left on this selected plan.`;
}
