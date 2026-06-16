'use client';

import { useEffect, useState } from 'react';

const OFFER_SEEN_KEY = 'pv_launch_offer_seen_v1';
const FIRST_VIEW_ANIMATION_MS = 6500;

type LaunchOfferBannerProps = {
  className?: string;
  tone?: 'dark' | 'light';
  maxSlots?: number | null;
  remainingSlots?: number | null;
  offerDurationDays?: number | null;
};

export function LaunchOfferBanner({
  className = '',
  tone = 'dark',
  maxSlots = 100,
  remainingSlots = null,
  offerDurationDays = 7,
}: LaunchOfferBannerProps) {
  const [isFirstView, setIsFirstView] = useState(false);
  const totalSlots = Math.max(1, Number(maxSlots || 100));
  const safeDuration = Math.max(1, Number(offerDurationDays || 7));
  const safeRemaining = remainingSlots == null ? null : Math.max(0, Number(remainingSlots));
  const shouldHide = safeRemaining !== null && safeRemaining <= 0;

  const offerText = `First ${totalSlots} users get free Pro access for ${safeDuration} days`;

  useEffect(() => {
    if (shouldHide) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const seen = window.localStorage.getItem(OFFER_SEEN_KEY);
    if (seen === '1') {
      return;
    }

    window.localStorage.setItem(OFFER_SEEN_KEY, '1');

    const startTimeout = window.setTimeout(() => {
      setIsFirstView(true);
    }, 0);

    const stopTimeout = window.setTimeout(() => {
      setIsFirstView(false);
    }, FIRST_VIEW_ANIMATION_MS);

    return () => {
      window.clearTimeout(startTimeout);
      window.clearTimeout(stopTimeout);
    };
  }, [shouldHide]);

  if (shouldHide) {
    return null;
  }

  return (
    <div className={className}>
      <div
        className={[
          'launch-offer-banner',
          tone === 'light' ? 'launch-offer-light' : 'launch-offer-dark',
          isFirstView ? 'launch-offer-first-view' : '',
        ].join(' ').trim()}
      >
        <span className="launch-offer-dot" aria-hidden="true" />
        <span>{offerText}</span>
        {isFirstView ? <span className="launch-offer-burst" aria-hidden="true" /> : null}
      </div>
      {safeRemaining !== null ? (
        <div className={`mt-1 text-xs font-semibold ${tone === 'light' ? 'text-emerald-700 dark:text-emerald-300' : 'text-emerald-300'}`}>
          Remaining spots: {safeRemaining}
        </div>
      ) : null}
    </div>
  );
}
