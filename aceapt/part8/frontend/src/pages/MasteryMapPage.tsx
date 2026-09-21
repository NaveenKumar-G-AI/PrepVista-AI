import { useEffect, useState } from "react";
import { api, ApiError, type MasteryMap } from "../api/client";
import { SkillCard } from "../components/SkillCard";

export function MasteryMapPage() {
  const [map, setMap] = useState<MasteryMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMasteryMap()
      .then(setMap)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your mastery map."));
  }, []);

  if (error) return <p className="text-sm text-regressed">{error}</p>;
  if (!map) return <p className="text-sm text-ink-faint">Loading...</p>;

  const hasAnySkills = map.categories.some((c) => c.skills.length > 0);
  if (!hasAnySkills) {
    return <p className="text-sm text-ink-faint">No skills are set up yet. Run the seed script, then refresh.</p>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl display-crossbar">Mastery map</h1>
        <p className="mt-2 text-sm text-ink-soft max-w-2xl">
          This reflects evidence ACEAPT has actually collected, not a completion checklist. A skill only moves from{" "}
          <span className="text-provisional">provisional</span> to <span className="text-verified">verified</span> once it's been tested on
          unfamiliar variations, and only reaches <span className="text-verified">stable</span> once that holds up over time.
        </p>
      </div>

      {map.categories.map((cat) => (
        <section key={cat.category}>
          <h2 className="text-xs uppercase tracking-[0.15em] text-ink-faint mb-3">{cat.category}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cat.skills.map((skill) => (
              <SkillCard key={skill.skillId} entry={skill} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
