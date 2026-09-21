import { useEffect, useState } from "react";
import { api, type OverviewResponse } from "./api.js";
import { MilestonesPanel, OverviewHeader, SkillList, TimelinePanel } from "./components/Panels.js";

interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function App() {
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/dev/demo-users")
      .then((r) => r.json())
      .then((data) => {
        const students = (data.users as DemoUser[]).filter((u) => u.role === "STUDENT");
        setDemoUsers(students);
        if (students[0]) setSelectedId(students[0].id);
      })
      .catch(() => setError("Could not reach the API. Is the server running on :4000?"));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    api
      .overview(selectedId, selectedId, "STUDENT")
      .then(setOverview)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedId]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-raised">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="font-display font-semibold text-lg tracking-tight">CodeForge AI</div>
            <div className="text-xs font-mono uppercase tracking-wider text-ink/45">Technical Growth</div>
          </div>
          {demoUsers.length > 0 && (
            <div className="flex gap-2">
              {demoUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    selectedId === u.id
                      ? "bg-signal text-white border-signal"
                      : "border-line text-ink/60 hover:border-signal/40"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="border border-regression/30 bg-regression/5 text-regression rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-sm text-ink/40 font-mono">Loading growth data…</div>}

        {overview && !loading && (
          <>
            <OverviewHeader overallGrowth={overview.overallGrowth} />
            <SkillList
              skills={overview.skills}
              studentId={overview.studentId}
              userId={selectedId!}
              role="STUDENT"
              milestones={overview.recentMilestones}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MilestonesPanel milestones={overview.recentMilestones} />
              <TimelinePanel events={overview.recentEvents} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
