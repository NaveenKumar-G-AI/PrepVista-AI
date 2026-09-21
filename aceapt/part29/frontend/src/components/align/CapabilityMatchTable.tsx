import React from 'react';
import { AlignmentResult } from '../../types/align.types';
import { LevelPill } from './shared';

export function CapabilityMatchTable({ result }: { result: AlignmentResult }) {
  const rows = [
    ...result.strengths.map((s) => ({
      capabilityId: s.capabilityId,
      capabilityName: s.capabilityName,
      importance: s.importance,
      level: s.level,
      met: true,
    })),
    ...result.criticalGaps.map((g) => ({
      capabilityId: g.capabilityId,
      capabilityName: g.capabilityName,
      importance: g.importance,
      level: g.currentLevel,
      met: false,
    })),
    ...result.supportingGaps.map((g) => ({
      capabilityId: g.capabilityId,
      capabilityName: g.capabilityName,
      importance: g.importance,
      level: g.currentLevel,
      met: false,
    })),
  ];

  return (
    <table className="w-full border-collapse font-body text-sm">
      <caption className="sr-only">Capability match against {result.targetName}</caption>
      <thead>
        <tr className="border-b border-align-border text-left text-xs uppercase tracking-wider text-align-text-tertiary">
          <th className="py-2 font-normal">Capability</th>
          <th className="py-2 font-normal">Importance</th>
          <th className="py-2 font-normal">Demonstrated level</th>
          <th className="py-2 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.capabilityId} className="border-b border-align-border/60">
            <td className="py-2.5 text-align-text-primary">{row.capabilityName}</td>
            <td className="py-2.5 text-align-text-secondary">{row.importance.charAt(0) + row.importance.slice(1).toLowerCase()}</td>
            <td className="py-2.5">
              <LevelPill level={row.level} met={row.met} />
            </td>
            <td className="py-2.5">
              {row.met ? (
                <span className="inline-flex items-center gap-1 text-align-readiness" aria-label="Met">
                  <CheckIcon /> Met
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-align-caution" aria-label="Developing">
                  <DevelopingIcon /> Developing
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DevelopingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 3.5V7.5L9.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
