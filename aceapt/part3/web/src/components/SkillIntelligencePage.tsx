import React from 'react';
import type { StudentSkillProfile, Skill, StudentSkillState } from '../types';
import { ConfidenceGauge, capabilityLabel } from './ConfidenceGauge';

function SkillRow({ skill, state, onSelect }: { skill: Skill; state: StudentSkillState; onSelect: (id: string) => void }) {
  return (
    <button className="skill-row" onClick={() => onSelect(skill.id)}>
      <span className="skill-row-name">{skill.name}</span>
      <span className="skill-row-meta">
        <ConfidenceGauge capability={state.capability} evidenceStrength={state.evidenceStrength} size="sm" />
        <span className="skill-row-state">{capabilityLabel(state.capability)}</span>
      </span>
    </button>
  );
}

export function SkillIntelligencePage({
  profile,
  onSelectSkill,
}: {
  profile: StudentSkillProfile;
  onSelectSkill: (id: string) => void;
}) {
  const byId = new Map(profile.skills.map((s) => [s.skill.id, s]));
  const group = (ids: string[]) => ids.map((id) => byId.get(id)).filter((x): x is (typeof profile.skills)[number] => Boolean(x));

  return (
    <div className="grid">
      <section className="panel">
        <h3>Strongest</h3>
        {group(profile.strongest).length === 0 && <p className="empty-note">Nothing here yet — expected early on.</p>}
        {group(profile.strongest).map(({ skill, state }) => (
          <SkillRow key={skill.id} skill={skill} state={state} onSelect={onSelectSkill} />
        ))}
      </section>

      <section className="panel">
        <h3>Developing</h3>
        {group(profile.developing).length === 0 && <p className="empty-note">Nothing currently in progress.</p>}
        {group(profile.developing).map(({ skill, state }) => (
          <SkillRow key={skill.id} skill={skill} state={state} onSelect={onSelectSkill} />
        ))}
      </section>

      <section className="panel">
        <h3>Limited evidence</h3>
        {group(profile.limitedEvidence).length === 0 && <p className="empty-note">Everything has at least some evidence behind it.</p>}
        {group(profile.limitedEvidence).map(({ skill, state }) => (
          <SkillRow key={skill.id} skill={skill} state={state} onSelect={onSelectSkill} />
        ))}
      </section>

      {(profile.hiddenStrengths.length > 0 || profile.overconfidenceFlags.length > 0) && (
        <section className="panel panel-wide">
          <h3>How you see it, vs. what the evidence shows</h3>
          {profile.hiddenStrengths.map((h) => (
            <button key={h.skillId} className="insight-card insight-teal" onClick={() => onSelectSkill(h.skillId)}>
              {h.message}
            </button>
          ))}
          {profile.overconfidenceFlags.map((o) => (
            <button key={o.skillId} className="insight-card insight-amber" onClick={() => onSelectSkill(o.skillId)}>
              {o.message}
            </button>
          ))}
        </section>
      )}

      {profile.prerequisiteInsights.length > 0 && (
        <section className="panel panel-wide">
          <h3>Possible connections</h3>
          {profile.prerequisiteInsights.map((p, i) => (
            <button key={i} className="insight-card insight-violet" onClick={() => onSelectSkill(p.skillId)}>
              {p.message}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
