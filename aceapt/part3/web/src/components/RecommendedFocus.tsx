import React from 'react';
import type { PriorityBreakdown, Skill } from '../types';

export function RecommendedFocus({
  items,
  skillById,
  onSelect,
}: {
  items: Array<{ skillId: string; priority: PriorityBreakdown; reason: string }>;
  skillById: Map<string, Skill>;
  onSelect: (skillId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <section className="hero hero-empty">
        <p className="eyebrow">Your current focus</p>
        <h2>No high-impact gap yet</h2>
        <p className="hero-sub">Not enough evidence to rank a focus with confidence. Keep practicing and this will fill in.</p>
      </section>
    );
  }

  const [primary, ...rest] = items;
  const skill = skillById.get(primary.skillId);
  if (!skill) return null;

  return (
    <section className="hero">
      <p className="eyebrow">Your current focus</p>
      <button className="hero-main" onClick={() => onSelect(primary.skillId)}>
        <h2>{skill.name}</h2>
        <p className="hero-reason">{primary.reason}.</p>
      </button>

      <div className="hero-breakdown">
        <BreakdownBar label="Gap severity" value={primary.priority.gapSeverity} />
        <BreakdownBar label="Downstream impact" value={primary.priority.downstreamImpact} />
        <BreakdownBar label="Goal relevance" value={primary.priority.goalRelevance} />
        <BreakdownBar label="Urgency" value={primary.priority.urgency} />
        <BreakdownBar label="Evidence confidence" value={primary.priority.evidenceConfidence} />
      </div>

      {rest.length > 0 && (
        <div className="hero-also">
          <span className="hero-also-label">Also worth attention</span>
          {rest.map((r) => {
            const s = skillById.get(r.skillId);
            if (!s) return null;
            return (
              <button key={r.skillId} className="chip" onClick={() => onSelect(r.skillId)}>
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="breakdown-row">
      <span className="breakdown-label">{label}</span>
      <div className="breakdown-track">
        <div className="breakdown-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}
