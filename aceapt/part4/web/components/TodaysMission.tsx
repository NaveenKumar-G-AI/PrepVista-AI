import React from "react";
import type { DailyMissionView } from "./types";

export interface TodaysMissionProps {
  mission: DailyMissionView;
  skillName: string;
  onStart?: () => void;
}

export default function TodaysMission({ mission, skillName, onStart }: TodaysMissionProps) {
  const total = mission.totalMinutes || mission.segments.reduce((s, seg) => s + seg.minutes, 0) || 1;

  return (
    <div className="aceapt-todays-mission">
      <style>{`
        .aceapt-todays-mission {
          --tm-bg: #1c232e; --tm-text: #edeff2; --tm-muted: #8b93a1; --tm-steel: #5fa8d3; --tm-brass: #c9a15a;
          background: var(--tm-bg); color: var(--tm-text); border-radius: 14px; padding: 20px 22px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .aceapt-todays-mission .tm-header { display: flex; justify-content: space-between; align-items: baseline; }
        .aceapt-todays-mission h4 { margin: 0; font-family: 'Space Grotesk', 'Inter', sans-serif; font-size: 15px; font-weight: 600; }
        .aceapt-todays-mission .tm-total { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; color: var(--tm-muted); }
        .aceapt-todays-mission .tm-skill { font-size: 12.5px; color: var(--tm-muted); margin: 2px 0 14px; }
        .aceapt-todays-mission .tm-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #14181f; }
        .aceapt-todays-mission .tm-seg-fill { height: 100%; }
        .aceapt-todays-mission .tm-list { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
        .aceapt-todays-mission .tm-item { display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: baseline; }
        .aceapt-todays-mission .tm-minutes { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; color: var(--tm-brass); }
        .aceapt-todays-mission .tm-label { font-size: 13px; font-weight: 500; }
        .aceapt-todays-mission .tm-desc { font-size: 12px; color: var(--tm-muted); margin-top: 1px; }
        .aceapt-todays-mission .tm-start { margin-top: 16px; width: 100%; padding: 10px; border-radius: 8px; border: none; background: var(--tm-steel); color: #0d1116; font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit; }
        .aceapt-todays-mission .tm-start:hover { filter: brightness(1.08); }
      `}</style>

      <div className="tm-header">
        <h4>Today's Plan</h4>
        <span className="tm-total">{mission.totalMinutes} min</span>
      </div>
      <p className="tm-skill">{skillName}</p>

      <div className="tm-bar">
        {mission.segments.map((seg, i) => (
          <div
            key={i}
            className="tm-seg-fill"
            style={{ width: `${(seg.minutes / total) * 100}%`, background: i % 2 === 0 ? "var(--tm-steel)" : "var(--tm-brass)" }}
          />
        ))}
      </div>

      <div className="tm-list">
        {mission.segments.map((seg, i) => (
          <div className="tm-item" key={i}>
            <span className="tm-minutes">{seg.minutes}m</span>
            <div>
              <div className="tm-label">{seg.label}</div>
              <div className="tm-desc">{seg.description}</div>
            </div>
          </div>
        ))}
      </div>

      {onStart && (
        <button className="tm-start" onClick={onStart}>
          Start
        </button>
      )}
    </div>
  );
}
