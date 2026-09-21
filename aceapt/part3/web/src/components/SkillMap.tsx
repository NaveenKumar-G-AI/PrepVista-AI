import React from 'react';
import type { StudentSkillProfile } from '../types';
import { ConfidenceGauge, capabilityLabel } from './ConfidenceGauge';

export function SkillMap({ profile, onSelectSkill }: { profile: StudentSkillProfile; onSelectSkill: (id: string) => void }) {
  const domains = Array.from(new Set(profile.skills.map((s) => s.skill.domain)));

  return (
    <section className="panel panel-wide skill-map">
      <h3>Skill map</h3>
      {domains.map((domain) => {
        const inDomain = profile.skills.filter((s) => s.skill.domain === domain);
        const topics = Array.from(new Set(inDomain.map((s) => s.skill.topic)));
        return (
          <div key={domain} className="map-domain">
            <p className="map-domain-name">{domain}</p>
            {topics.map((topic) => (
              <div key={topic} className="map-topic">
                <p className="map-topic-name">{topic}</p>
                <ul className="map-skill-list">
                  {inDomain
                    .filter((s) => s.skill.topic === topic)
                    .map(({ skill, state }) => (
                      <li key={skill.id}>
                        <button className="map-skill" onClick={() => onSelectSkill(skill.id)}>
                          <ConfidenceGauge capability={state.capability} evidenceStrength={state.evidenceStrength} size="sm" />
                          <span className="map-skill-name">{skill.name}</span>
                          <span className="map-skill-state">{capabilityLabel(state.capability)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
