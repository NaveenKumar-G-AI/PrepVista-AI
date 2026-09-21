import React, { useEffect, useState } from 'react';
import { fetchSkillDetail } from '../api';
import type { SkillDetailResponse } from '../types';
import { ConfidenceGauge, capabilityLabel } from './ConfidenceGauge';

export function SkillDetail({
  skillId,
  skillNameById,
  onClose,
  onNavigate,
}: {
  skillId: string;
  skillNameById: Record<string, string>;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    fetchSkillDetail(skillId)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [skillId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Skill detail">
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="overlay-panel">
        <button className="overlay-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {error && <p className="empty-note">Couldn't load this skill: {error}</p>}
        {!detail && !error && <p className="empty-note">Loading…</p>}

        {detail && detail.state && (
          <>
            <p className="eyebrow">
              {detail.skill.domain} · {detail.skill.topic}
            </p>
            <h2>{detail.skill.name}</h2>

            <div className="detail-gauge-row">
              <ConfidenceGauge capability={detail.state.capability} evidenceStrength={detail.state.evidenceStrength} />
              <span className="detail-state-label">{capabilityLabel(detail.state.capability)}</span>
            </div>
            <p className="detail-evidence-note">
              Evidence: {capabilityLabel(detail.state.evidenceStrength)} · {detail.evidenceCount} attempt
              {detail.evidenceCount === 1 ? '' : 's'} · Freshness: {capabilityLabel(detail.state.freshness)}
            </p>

            <div className="detail-subscores">
              <SubScore label="Foundation" state={detail.state.foundation.state} count={detail.state.foundation.evidenceCount} />
              <SubScore label="Application" state={detail.state.application.state} count={detail.state.application.evidenceCount} />
              <SubScore label="Transfer" state={detail.state.transfer.state} count={detail.state.transfer.evidenceCount} />
            </div>

            {detail.state.gapTypes.length > 0 && (
              <div className="detail-block">
                <p className="detail-block-title">Gap type{detail.state.gapTypes.length > 1 ? 's' : ''}</p>
                <p>{detail.state.gapTypes.map((g) => capabilityLabel(g)).join(', ')}</p>
              </div>
            )}

            {detail.prerequisites.length > 0 && (
              <div className="detail-block">
                <p className="detail-block-title">Prerequisite</p>
                <div className="chip-row">
                  {detail.prerequisites.map((p) => (
                    <button key={p.fromSkillId} className="chip" onClick={() => onNavigate(p.fromSkillId)}>
                      {skillNameById[p.fromSkillId] ?? p.fromSkillId}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.related.length > 0 && (
              <div className="detail-block">
                <p className="detail-block-title">Related</p>
                <div className="chip-row">
                  {detail.related.map((r) => {
                    const otherId = r.fromSkillId === detail.skill.id ? r.toSkillId : r.fromSkillId;
                    return (
                      <button key={r.fromSkillId + r.toSkillId} className="chip" onClick={() => onNavigate(otherId)}>
                        {skillNameById[otherId] ?? otherId}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {detail.state.priorityBreakdown && (
              <div className="detail-block">
                <p className="detail-block-title">Why this matters</p>
                <ul className="detail-reasons">
                  {detail.state.priorityBreakdown.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {detail && !detail.state && <p className="empty-note">No evidence yet for this skill.</p>}
      </div>
    </div>
  );
}

function SubScore({ label, state, count }: { label: string; state: string; count: number }) {
  return (
    <div className="subscore">
      <span className="subscore-label">{label}</span>
      <span className="subscore-value">{capabilityLabel(state)}</span>
      <span className="subscore-count">
        {count} pt{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}
