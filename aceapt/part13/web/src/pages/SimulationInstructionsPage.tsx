import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { AssessmentProfile, DeliverableQuestion } from "../lib/types";

interface SimMeta {
  simulation: { id: string; profileId: string; practiceMode: string; durationMinutes: number };
  questions: DeliverableQuestion[];
}

export default function SimulationInstructionsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sim, setSim] = useState<SimMeta | null>(null);
  const [profile, setProfile] = useState<AssessmentProfile | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<SimMeta>(`/simulations/${id}`).then((s) => {
      setSim(s);
      api.get<{ profile: AssessmentProfile }>(`/assessment-profiles/${s.simulation.profileId}`).then((p) => setProfile(p.profile));
    });
  }, [id]);

  if (!sim || !profile) {
    return <div className="text-center text-paper-500 py-24 text-sm">Assembling assessment…</div>;
  }

  const sections = [...new Set(sim.questions.map((q) => q.section))];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="label-caps mb-2">{profile.assessmentType.replace(/_/g, " ")}</div>
      <h1 className="font-display text-2xl font-semibold text-paper-100 mb-6">{profile.name}</h1>

      <div className="panel p-6 mb-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <div className="label-caps mb-1">Duration</div>
            <div className="data-figure text-2xl text-paper-100">{profile.durationMinutes}m</div>
          </div>
          <div>
            <div className="label-caps mb-1">Questions</div>
            <div className="data-figure text-2xl text-paper-100">{sim.questions.length}</div>
          </div>
          <div>
            <div className="label-caps mb-1">Negative marking</div>
            <div className="data-figure text-2xl text-paper-100">
              {profile.negativeMarking.enabled ? `-${(profile.negativeMarking.penaltyFraction * 100).toFixed(0)}%` : "None"}
            </div>
          </div>
        </div>

        <div className="label-caps mb-2">Sections</div>
        <div className="flex flex-wrap gap-2 mb-6">
          {sections.map((s) => (
            <span key={s} className="text-xs px-2.5 py-1 rounded-md border border-ink-600 text-paper-300">
              {s}
            </span>
          ))}
        </div>

        <ul className="text-sm text-paper-300 space-y-2 leading-relaxed">
          <li>• You may skip a question and return to it later using the question navigator.</li>
          <li>• The timer runs continuously — there is no per-question time limit.</li>
          <li>• Once submitted, the assessment cannot be resumed or edited.</li>
          {profile.negativeMarking.enabled && (
            <li className="text-signal-developing">
              • Incorrect answers deduct {(profile.negativeMarking.penaltyFraction * 100).toFixed(0)}% of a correct answer's marks.
              Unanswered questions are not penalized.
            </li>
          )}
        </ul>
      </div>

      <button
        onClick={() => navigate(`/simulations/${id}/run`)}
        className="w-full rounded-lg bg-signal-ready text-ink-950 font-medium text-sm py-3 hover:bg-signal-ready/90 transition-colors"
      >
        Begin assessment
      </button>
    </div>
  );
}
