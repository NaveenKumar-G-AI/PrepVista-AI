import React from 'react';
import './StudentOfferCard.css';

/**
 * NOT EXECUTED/TESTED in this build (no React toolchain in the sandbox
 * this was authored in - see README). Provided as a design reference for
 * spec section 22/68 ("My Offers" / premium offer card), built against
 * offer/joining fields as named in schemas/offers/types.js.
 *
 * Design direction: an official, letterhead-and-seal feel rather than a
 * startup/confetti one - this is a placement office issuing something
 * consequential, not a marketing moment. See design token comments in
 * StudentOfferCard.css.
 *
 * @param {{
 *   offer: {
 *     companyName: string, roleTitle: string, location: string,
 *     ctcDisplay: string, employmentType: string,
 *     acceptanceDeadline: string, joiningDate: string,
 *     status: string, verificationStatus: string,
 *   },
 *   now: Date,
 *   onAccept?: () => void,
 *   onDecline?: () => void,
 *   onViewDetails?: () => void,
 * }} props
 */
export default function StudentOfferCard({ offer, now = new Date(), onAccept, onDecline, onViewDetails }) {
  const deadline = new Date(offer.acceptanceDeadline);
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3600000;
  const canDecide = offer.status === 'ACCEPTANCE_PENDING';
  const isVerified = offer.verificationStatus === 'VERIFIED';

  const deadlineLabel = formatDeadline(deadline, hoursLeft);
  const statusLabel = STATUS_LABELS[offer.status] ?? offer.status;

  return (
    <article className="pv-offer-card" aria-label={`Offer from ${offer.companyName}`}>
      <div className="pv-offer-card__fold" aria-hidden="true" />

      <div className="pv-offer-card__eyebrow-row">
        <span className="pv-offer-card__eyebrow">Placement Office &middot; Offer Received</span>
        {isVerified && (
          <span className="pv-offer-card__seal" title="Verified by the placement office">
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <path
                d="M4 10.5l3.5 3.5L16 5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Verified
          </span>
        )}
      </div>

      <h2 className="pv-offer-card__company">{offer.companyName}</h2>
      <p className="pv-offer-card__role">{offer.roleTitle}</p>

      <div className="pv-offer-card__figures">
        <span className="pv-offer-card__ctc">{offer.ctcDisplay}</span>
        <span className="pv-offer-card__location">{offer.location}</span>
      </div>

      <dl className="pv-offer-card__meta">
        <div>
          <dt>Employment type</dt>
          <dd>{offer.employmentType}</dd>
        </div>
        <div>
          <dt>Joining date</dt>
          <dd>{formatDate(new Date(offer.joiningDate))}</dd>
        </div>
      </dl>

      <div className={`pv-offer-card__deadline pv-offer-card__deadline--${deadlineUrgency(hoursLeft)}`}>
        <span className="pv-offer-card__deadline-label">Acceptance closes</span>
        <span className="pv-offer-card__deadline-value">{deadlineLabel}</span>
      </div>

      <div className="pv-offer-card__status">
        <span className={`pv-offer-card__status-dot pv-offer-card__status-dot--${offer.status.toLowerCase()}`} />
        {statusLabel}
      </div>

      <div className="pv-offer-card__actions">
        <button type="button" className="pv-offer-card__btn pv-offer-card__btn--ghost" onClick={onViewDetails}>
          Review offer
        </button>
        {canDecide && (
          <>
            <button type="button" className="pv-offer-card__btn pv-offer-card__btn--quiet" onClick={onDecline}>
              Decline
            </button>
            <button type="button" className="pv-offer-card__btn pv-offer-card__btn--primary" onClick={onAccept}>
              Accept offer
            </button>
          </>
        )}
      </div>
    </article>
  );
}

const STATUS_LABELS = {
  ACCEPTANCE_PENDING: 'Awaiting your decision',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Acceptance window closed',
  PUBLISHED: 'Published',
  VERIFIED: 'Verified',
};

function deadlineUrgency(hoursLeft) {
  if (hoursLeft <= 0) return 'closed';
  if (hoursLeft <= 24) return 'urgent';
  if (hoursLeft <= 72) return 'soon';
  return 'normal';
}

function formatDeadline(deadline, hoursLeft) {
  if (hoursLeft <= 0) return 'Closed';
  if (hoursLeft <= 24) return `Today \u00b7 ${formatTime(deadline)}`;
  return `${formatDate(deadline)} \u00b7 ${formatTime(deadline)}`;
}

function formatDate(d) {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
