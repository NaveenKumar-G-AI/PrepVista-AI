import React from 'react';
import './TpoInsightsPanel.css';

/**
 * NOT EXECUTED/TESTED in this build - see README truth table. The DATA
 * behind every number here (funnel, companyScorecard, todayDigest) comes
 * from the tested services/analytics/ modules; this component only
 * renders whatever it's given - no sample data, no client-side math.
 *
 * @param {{
 *   funnel: ReturnType<typeof import('../services/analytics/funnel').computeFunnel>,
 *   companyScorecard: ReturnType<typeof import('../services/analytics/companyScorecard').computeCompanyScorecard>,
 *   todayDigest: ReturnType<typeof import('../services/analytics/todayDigest').computeTodayDigest>,
 *   companyNameById?: Record<string, string>,
 *   maxCompanyRows?: number,
 * }} props
 */
export default function TpoInsightsPanel({ funnel, companyScorecard, todayDigest, companyNameById = {}, maxCompanyRows = 6 }) {
  const maxStageCount = Math.max(1, ...Object.values(funnel.stageReachedCounts));

  return (
    <section className="pv-insights" aria-label="Placement insights">
      <div className="pv-insights__block">
        <h3 className="pv-insights__heading">Conversion funnel</h3>
        <div className="pv-insights__funnel">
          {Object.entries(funnel.stageReachedCounts).map(([stage, count]) => (
            <div className="pv-insights__funnel-row" key={stage}>
              <span className="pv-insights__funnel-label">{STAGE_LABELS[stage] ?? stage}</span>
              <div className="pv-insights__funnel-track">
                <div
                  className="pv-insights__funnel-bar"
                  style={{ width: `${Math.max(4, (count / maxStageCount) * 100)}%` }}
                />
              </div>
              <span className="pv-insights__funnel-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pv-insights__block">
        <h3 className="pv-insights__heading">Company scorecard</h3>
        <table className="pv-insights__table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Offers</th>
              <th>Acceptance</th>
              <th>Joining</th>
            </tr>
          </thead>
          <tbody>
            {companyScorecard.slice(0, maxCompanyRows).map((row) => (
              <tr key={row.companyId}>
                <td>{companyNameById[row.companyId] ?? row.companyId}</td>
                <td className="pv-insights__num">{row.offersExtended}</td>
                <td className="pv-insights__num">{formatPercent(row.acceptanceRate)}</td>
                <td className="pv-insights__num">{formatPercent(row.joiningRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pv-insights__block">
        <h3 className="pv-insights__heading">Needs attention today</h3>
        <div className="pv-insights__today">
          <TodayItem label="Expiring today" value={todayDigest.counts.expiringToday} tone="amber" />
          <TodayItem label="Overdue, not expired" value={todayDigest.counts.overdueNotExpired} tone="rose" />
          <TodayItem label="Evidence awaiting verification" value={todayDigest.counts.evidenceAwaitingVerification} tone="amber" />
          <TodayItem label="Stuck in verification" value={todayDigest.counts.staleInVerification} tone="rose" />
          <TodayItem label="Joining today" value={todayDigest.counts.joiningToday} tone="seal" />
        </div>
      </div>
    </section>
  );
}

function TodayItem({ label, value, tone }) {
  const isZero = !value;
  return (
    <div className={`pv-insights__today-item${isZero ? ' pv-insights__today-item--zero' : ''}`}>
      <span className={`pv-insights__today-value pv-insights__today-value--${tone}`}>{value}</span>
      <span className="pv-insights__today-label">{label}</span>
    </div>
  );
}

const STAGE_LABELS = {
  RECEIVED: 'Received',
  UNDER_VERIFICATION: 'Under verification',
  VERIFIED: 'Verified',
  PUBLISHED: 'Published',
  ACCEPTANCE_PENDING: 'Awaiting response',
  ACCEPTED: 'Accepted',
};

function formatPercent(rate) {
  if (rate === null || rate === undefined) return '\u2014';
  return `${Math.round(rate * 100)}%`;
}
