import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api/client';
import type { ProgressPoint } from '../types';

export default function ProgressStoryPanel() {
  const [story, setStory] = useState<ProgressPoint[] | null>(null);

  useEffect(() => {
    api.progressStory().then((res) => setStory(res.story));
  }, []);

  if (!story) return <div className="h-64 rounded-xl border border-line bg-panel animate-pulse" />;

  if (story.length < 2) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-center text-slate">
        Complete a couple of actions in the Action Center to start building your progress story.
      </div>
    );
  }

  const data = story.map((p, i) => ({ step: i === 0 ? 'Start' : p.driver_action, readiness: p.readiness }));
  const before = story[0];
  const after = story[story.length - 1];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-panel p-6">
        <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase mb-4">Readiness over time</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 8 }}>
              <CartesianGrid stroke="#2A3D59" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="step" tick={{ fill: '#8DA0B8', fontSize: 11 }} axisLine={{ stroke: '#2A3D59' }} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#8DA0B8', fontSize: 11 }}
                axisLine={{ stroke: '#2A3D59' }}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: '#172A42', border: '1px solid #2A3D59', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#EDF1F7' }}
              />
              <Line type="monotone" dataKey="readiness" stroke="#F0A83C" strokeWidth={2.5} dot={{ fill: '#F0A83C', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-xl border border-line bg-panel p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Before</p>
          <p className="font-mono text-3xl font-semibold tabular mt-2">{before.readiness}%</p>
        </div>
        <div className="rounded-xl border border-teal/30 bg-teal/5 p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-teal uppercase">After</p>
          <p className="font-mono text-3xl font-semibold tabular mt-2 text-teal">{after.readiness}%</p>
        </div>
      </div>
    </div>
  );
}
