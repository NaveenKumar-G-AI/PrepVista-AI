'use client';

import React from 'react';
import { useOrgContext } from '../layout';

export function CommandCentreHero() {
  const { cohortAvgScore, studentsWithSessions, readinessTierCounts } = useOrgContext();

  const isDataAvailable = studentsWithSessions > 0;
  
  // Count students that meet the product's readiness tier rule. This is an
  // interview-preparation signal, not an employment or offer prediction.
  const readyCount = readinessTierCounts?.ready || 0;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr] border border-border rounded-2xl overflow-hidden mb-4 bg-secondary">
      <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r border-border">
        <div className="text-[11px] uppercase tracking-[0.14em] text-secondary font-bold mb-4">
          Readiness Index
        </div>
        <h2 className="text-[19px] font-normal text-primary mb-1">
          Readiness Threshold Met
        </h2>
        <div className="text-[56px] md:text-[92px] leading-none font-light tracking-[-0.02em] text-primary my-1">
          {isDataAvailable ? readyCount : '—'}
        </div>
        <div className="text-[13px] text-secondary mt-2">
          <b className="text-primary font-semibold">Total Assessed:</b> {studentsWithSessions} students
        </div>
      </div>
      
      <div className="p-6 md:p-8 flex flex-col justify-center">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-secondary mb-3.5">
          Cohort Performance
        </div>
        <div className="font-semibold text-[15px] text-primary mb-1">
          Average Interview Score
        </div>
        <div className="text-[12px] text-secondary">
          Avg. Score:{' '}
          <span className="text-emerald-500 font-mono font-bold text-[14px]">
            {cohortAvgScore !== null ? `${Math.round(cohortAvgScore)}/100` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
