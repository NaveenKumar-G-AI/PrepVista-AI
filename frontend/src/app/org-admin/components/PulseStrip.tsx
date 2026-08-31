'use client';

import React from 'react';
import { useOrgContext } from '../layout';

export function PulseStrip() {
  const { cohortAvgScore, studentsWithSessions, zeroOfferRiskCount, readinessTierCounts } = useOrgContext();

  const isDataAvailable = studentsWithSessions > 0;
  
  const readyOrAlmostReady = isDataAvailable && readinessTierCounts
    ? (readinessTierCounts.ready + readinessTierCounts.almost_ready) 
    : 0;

  return (
    <div className="flex flex-wrap border border-border rounded-2xl overflow-hidden mb-6 bg-secondary">
      <div className="flex-[1_1_140px] p-4 md:p-5 border-r border-b border-border">
        <div className="font-mono text-2xl font-semibold text-primary">
          {isDataAvailable && cohortAvgScore !== null ? `${Math.round(cohortAvgScore)}%` : '—'}
        </div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-secondary mt-1">
          Avg. Interview Score
        </div>
      </div>
      
      <div className="flex-[1_1_140px] p-4 md:p-5 border-r border-b border-border">
        <div className="font-mono text-2xl font-semibold text-primary">
          {isDataAvailable ? readyOrAlmostReady : '—'}
        </div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-secondary mt-1">
          Ready / Almost Ready
        </div>
      </div>
      
      <div className="flex-[1_1_140px] p-4 md:p-5 border-r border-b border-border">
        <div className="font-mono text-2xl font-semibold text-primary">
          {isDataAvailable ? studentsWithSessions : '—'}
        </div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-secondary mt-1">
          Assessed Students
        </div>
      </div>
      
      <div className={`flex-[1_1_140px] p-4 md:p-5 border-b border-border ${zeroOfferRiskCount > 0 ? 'text-rose-500' : 'text-primary'}`}>
        <div className="font-mono text-2xl font-semibold currentColor">
          {isDataAvailable ? zeroOfferRiskCount : '—'}
        </div>
        <div className={`text-[10px] uppercase tracking-[0.1em] mt-1 ${zeroOfferRiskCount > 0 ? 'text-rose-500/80' : 'text-secondary'}`}>
          Intervention Flags
        </div>
      </div>
    </div>
  );
}
