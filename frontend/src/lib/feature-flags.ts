function readPublicBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

/**
 * Presentation-only switch. Launch-offer services and persisted grants remain
 * intact so the promotion can be restored without data loss or a migration.
 */
export const launchOfferVisible = readPublicBoolean(
  process.env.NEXT_PUBLIC_LAUNCH_OFFER_VISIBLE,
);

/** Keeps the login-page candidate-count message reversible without changing it. */
export const loginSocialProofVisible = readPublicBoolean(
  process.env.NEXT_PUBLIC_LOGIN_SOCIAL_PROOF_VISIBLE,
);

/** Keeps the dashboard active-candidate message reversible without changing it. */
export const dashboardSocialProofVisible = readPublicBoolean(
  process.env.NEXT_PUBLIC_DASHBOARD_SOCIAL_PROOF_VISIBLE,
);
