import React, { useEffect, useState } from 'react';
import { fetchProfile } from './api';
import type { StudentSkillProfile } from './types';
import { RecommendedFocus } from './components/RecommendedFocus';
import { SkillIntelligencePage } from './components/SkillIntelligencePage';
import { SkillMap } from './components/SkillMap';
import { SkillDetail } from './components/SkillDetail';

export default function App() {
  const [profile, setProfile] = useState<StudentSkillProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile()
      .then(setProfile)
      .catch((e) => setError(String(e)));
  }, []);

  const skillNameById: Record<string, string> = {};
  profile?.skills.forEach((s) => {
    skillNameById[s.skill.id] = s.skill.name;
  });

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">ACEAPT · Feature 3</p>
        <h1>Your Skill Intelligence</h1>
        <p className="page-sub">Evidence-based, not a topic list — every claim below is tappable into what actually backs it.</p>
      </header>

      {error && <p className="empty-note">Couldn't load your profile ({error}). Is the server running?</p>}
      {!profile && !error && <p className="empty-note">Loading your skill intelligence…</p>}

      {profile && (
        <main>
          <RecommendedFocus
            items={profile.recommendedFocus}
            skillById={new Map(profile.skills.map((s) => [s.skill.id, s.skill]))}
            onSelect={setSelectedSkillId}
          />
          <SkillIntelligencePage profile={profile} onSelectSkill={setSelectedSkillId} />
          <SkillMap profile={profile} onSelectSkill={setSelectedSkillId} />
        </main>
      )}

      {selectedSkillId && (
        <SkillDetail
          skillId={selectedSkillId}
          skillNameById={skillNameById}
          onClose={() => setSelectedSkillId(null)}
          onNavigate={setSelectedSkillId}
        />
      )}
    </div>
  );
}
