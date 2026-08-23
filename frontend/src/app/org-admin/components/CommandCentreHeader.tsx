'use client';

import React from 'react';
import { useOrgContext } from '../layout';

export function CommandCentreHeader({ title = 'Overview' }: { title?: string }) {
  const { orgName, loading } = useOrgContext();

  return (
    <div className="flex items-center gap-4 px-8 py-4 border-b border-border bg-primary/50 backdrop-blur-md sticky top-0 z-20">
      <div className="leading-snug">
        <div className="text-[9.5px] uppercase tracking-[0.13em] text-secondary font-bold">
          {loading ? 'Loading...' : orgName || 'Institution'}
        </div>
        <div className="text-[15px] font-semibold text-primary">{title}</div>
      </div>
      
      <div className="text-emerald-500 font-bold mx-1">•</div>
      
      <div className="inline-flex items-center gap-1.5 text-[11px] text-secondary border border-border/50 px-2.5 py-1 rounded-full bg-secondary">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        Live Sync
      </div>
      
      <div className="flex-1" />
      
      <div className="hidden md:flex flex-1 max-w-[420px] items-center gap-2 border border-border/50 rounded-lg px-3 py-1.5 text-[12.5px] bg-secondary text-secondary focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input 
          type="text" 
          placeholder="Search students, skills or metrics..." 
          className="bg-transparent border-none outline-none text-primary flex-1 placeholder:text-tertiary"
        />
        <kbd className="text-[9.5px] border border-border rounded px-1.5 py-0.5 text-tertiary font-mono bg-primary/30">⌘K</kbd>
      </div>
      
      <div className="w-8 h-8 rounded-full border border-border bg-secondary flex items-center justify-center text-[11px] font-bold text-secondary flex-shrink-0 cursor-pointer hover:bg-hover transition-colors">
        {loading ? '...' : (orgName ? orgName.substring(0, 2).toUpperCase() : 'AD')}
      </div>
    </div>
  );
}
