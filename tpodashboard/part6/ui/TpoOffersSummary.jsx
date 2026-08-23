import React from 'react';
import './TpoOffersSummary.css';

/**
 * NOT EXECUTED/TESTED in this build - see README truth table. Design
 * reference for spec section 39 ("Offers & Joining" top metrics) and
 * section 69's two-block layout (Offers ledger, Joining ledger).
 *
 * Every number here must come from services/offers/offerQueries.js and
 * services/joining/joiningService.js against real records - this
 * component only renders whatever it's given, and deliberately has no
 * default/sample data baked in (spec section 84: "no fake numbers").
 *
 * @param {{
 *   offerMetrics: {total:number, verified:number, accepted:number, pending:number, declined:number, expiringSoon:number},
 *   joiningMetrics: {confirmed:number, pending:number, delayed:number, didNotJoin:number},
 *   onOpenWorkbench?: (key: string) => void,
 * }} props
 */
export default function TpoOffersSummary({ offerMetrics, joiningMetrics, onOpenWorkbench }) {
  return (
    <section className="pv-summary" aria-label="Offers and joining summary">
      <Ledger
        title="Offers"
        headline={offerMetrics.total}
        headlineLabel="total"
        entries={[
          { key: 'verified', label: 'Verified', value: offerMetrics.verified },
          { key: 'accepted', label: 'Accepted', value: offerMetrics.accepted, tone: 'seal' },
          { key: 'pending', label: 'Pending', value: offerMetrics.pending, tone: 'amber' },
          { key: 'declined', label: 'Declined', value: offerMetrics.declined },
          { key: 'expiring', label: 'Expiring soon', value: offerMetrics.expiringSoon, tone: 'rose' },
        ]}
        onOpenWorkbench={onOpenWorkbench}
      />
      <Ledger
        title="Joining"
        headline={joiningMetrics.confirmed}
        headlineLabel="joined"
        entries={[
          { key: 'joining-pending', label: 'Pending', value: joiningMetrics.pending, tone: 'amber' },
          { key: 'joining-delayed', label: 'Delayed', value: joiningMetrics.delayed, tone: 'amber' },
          { key: 'did-not-join', label: 'Did not join', value: joiningMetrics.didNotJoin, tone: 'rose' },
        ]}
        onOpenWorkbench={onOpenWorkbench}
      />
    </section>
  );
}

function Ledger({ title, headline, headlineLabel, entries, onOpenWorkbench }) {
  return (
    <div className="pv-ledger">
      <div className="pv-ledger__head">
        <span className="pv-ledger__title">{title}</span>
        <span className="pv-ledger__headline">
          {headline}
          <span className="pv-ledger__headline-label">{headlineLabel}</span>
        </span>
      </div>
      <div className="pv-ledger__row">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="pv-ledger__entry"
            onClick={() => onOpenWorkbench?.(entry.key)}
          >
            <span className={`pv-ledger__value pv-ledger__value--${entry.tone ?? 'default'}`}>
              {entry.value}
            </span>
            <span className="pv-ledger__label">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
