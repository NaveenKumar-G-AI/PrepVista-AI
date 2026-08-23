'use client';
import React, { useState } from 'react';

const briefing = [
  {cat:'Application deadline', tag:'urgent', tagLabel:'Urgent', detail:'Applications for Software Engineer close today. 83 eligible student(s) haven’t applied.'},
  {cat:'High-readiness unapplied', detail:'23 of those 83 are high-readiness (75+) students.'},
  {cat:'Pending interview results', detail:'12 interview result(s) have been pending for more than 24 hours.'},
  {cat:'Expiring offers', detail:'7 offer(s) expire within 48 hours.'},
  {cat:'Department interview conversion gap', detail:'ECE interview progression is 10 points below the institutional median (56.7%).'},
  {cat:'Data quality', tag:'caution', tagLabel:'Caution', detail:'7 joining record(s) are recorded but not yet verified — treat placement figures as provisional.'},
];

const scriptSteps = [
  { who:'tpo', label:'TPO', text:'What should I do first?' },
  { who:'ai', label:'AI', text:'Software Engineer at ABC Technologies: 198 eligible, 115 applied (58.1%), 83 unapplied. Deadline in 9h. Deadline risk flagged.' },
  { who:'tpo', label:'TPO', text:'Show them.' },
  { who:'ai', label:'AI', text:'23 eligible student(s) haven’t applied (12 CSE, 7 IT, 4 ECE).' },
  { who:'tpo', label:'TPO', text:'Prepare a reminder.' },
  { who:'ai', label:'AI', text:'Draft prepared for 83 recipient(s). Review it below before it sends.', action:'showRequisition' },
];

export default function AIOfficerPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [reqVisible, setReqVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [btnConfirmed, setBtnConfirmed] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const activeSteps = scriptSteps.slice(0, stepIndex);
  const nextStepInfo = scriptSteps[stepIndex];

  const handleNext = () => {
    if (nextStepInfo) {
      if (nextStepInfo.action === 'showRequisition') {
        setReqVisible(true);
      }
      setStepIndex(stepIndex + 1);
    }
  };

  const handleConfirm = () => {
    setResultVisible(true);
    setBtnConfirmed(true);
  };

  const handleGo = () => {
    if (!inputValue.trim()) return;
    setInputValue('');
  };

  return (
    <div className="pv-ai-root">
      <style>{`
        .pv-ai-root {
          --ink: #f8fafc;
          --ink-soft: #94a3b8;
          --paper: transparent;
          --paper-raised: #0f172a;
          --rule: rgba(255,255,255,0.1);
          --stamp-red: #f43f5e;
          --stamp-red-soft: rgba(244,63,94,0.15);
          --brass: #f59e0b;
          --brass-soft: rgba(245,158,11,0.15);
          --verify: #10b981;
          --verify-soft: rgba(16,185,129,0.15);
          
          --font-display: 'Source Serif 4', serif;
          --font-body: 'Inter', sans-serif;
          --font-mono: 'IBM Plex Mono', monospace;
          
          color: var(--ink);
          font-family: var(--font-body);
        }
        
        .pv-ai-root .sheet { max-width: 760px; margin: 0 auto; padding: 0 20px 80px; }
        .pv-ai-root header.masthead {
          padding: 34px 0 18px; border-bottom: 3px double var(--ink); margin-bottom: 26px;
          display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 10px;
        }
        .pv-ai-root .masthead .brand { font-family: var(--font-display); font-weight: 700; font-size: 1.7rem; letter-spacing: .02em; }
        .pv-ai-root .masthead .brand small { display: block; font-family: var(--font-mono); font-weight: 500; font-size: .62rem; letter-spacing: .24em; color: var(--ink-soft); margin-top: 4px; }
        .pv-ai-root .masthead .meta { font-family: var(--font-mono); font-size: .72rem; color: var(--ink-soft); text-align: right; line-height: 1.6; }
        
        .pv-ai-root .command {
          background: var(--paper-raised); border: 1px solid var(--ink); border-radius: 2px;
          padding: 14px 16px; display: flex; gap: 10px; align-items: center; box-shadow: 3px 3px 0 rgba(255,255,255,.05);
        }
        .pv-ai-root .command .glyph { font-family: var(--font-mono); color: var(--ink-soft); }
        .pv-ai-root .command input {
          flex: 1; border: none; background: transparent; font-family: var(--font-body); font-size: .98rem; color: var(--ink);
          outline: none;
        }
        .pv-ai-root .command input::placeholder { color: var(--ink-soft); }
        .pv-ai-root .command button {
          font-family: var(--font-mono); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase;
          background: var(--ink); color: var(--paper-raised); border: none; padding: 8px 12px; border-radius: 2px; cursor: pointer;
        }
        
        .pv-ai-root .suggested { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
        .pv-ai-root .suggested button {
          font-family: var(--font-mono); font-size: .68rem; color: var(--ink-soft); background: none;
          border: 1px solid var(--rule); border-radius: 20px; padding: 6px 12px; cursor: pointer;
        }
        .pv-ai-root .suggested button:hover { border-color: var(--ink); color: var(--ink); }
        
        .pv-ai-root section.block { margin-top: 44px; }
        .pv-ai-root .block-label {
          font-family: var(--font-mono); font-size: .68rem; letter-spacing: .22em; text-transform: uppercase;
          color: var(--ink-soft); display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
        }
        .pv-ai-root .block-label::after { content: ""; flex: 1; height: 1px; background: var(--rule); }
        
        .pv-ai-root .greeting { font-family: var(--font-display); font-size: 1.18rem; line-height: 1.5; margin: 0 0 18px; }
        
        .pv-ai-root .entry {
          display: grid; grid-template-columns: 52px 1fr; gap: 14px; padding: 14px 0; border-top: 1px solid var(--rule);
          animation: pv-rise .5s ease forwards;
        }
        .pv-ai-root .entry:last-child { border-bottom: 1px solid var(--rule); }
        @keyframes pv-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .pv-ai-root .entry .no { font-family: var(--font-mono); font-size: .72rem; color: var(--ink-soft); padding-top: 2px; }
        .pv-ai-root .entry .no b { display: block; font-size: .95rem; color: var(--ink); }
        .pv-ai-root .entry .cat { font-family: var(--font-mono); font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; }
        .pv-ai-root .entry .detail { font-size: .94rem; margin-top: 3px; line-height: 1.5; }
        .pv-ai-root .entry.urgent { border-left: 3px solid var(--stamp-red); padding-left: 12px; margin-left: -15px; }
        .pv-ai-root .entry.urgent .cat { color: var(--stamp-red); }
        .pv-ai-root .entry.caution .cat { color: var(--brass); }
        .pv-ai-root .tag {
          display: inline-block; font-family: var(--font-mono); font-size: .6rem; letter-spacing: .1em; padding: 2px 7px;
          border-radius: 2px; margin-left: 8px; vertical-align: middle;
        }
        .pv-ai-root .tag.urgent { background: var(--stamp-red-soft); color: var(--stamp-red); border: 1px solid var(--stamp-red); }
        .pv-ai-root .tag.caution { background: var(--brass-soft); color: var(--brass); border: 1px solid var(--brass); }
        
        .pv-ai-root .thread { display: flex; flex-direction: column; gap: 14px; }
        .pv-ai-root .turn { display: grid; grid-template-columns: 74px 1fr; gap: 14px; animation: pv-rise .45s ease forwards; }
        .pv-ai-root .turn .who { font-family: var(--font-mono); font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); padding-top: 3px; }
        .pv-ai-root .turn.tpo .who { color: var(--ink); font-weight: 600; }
        .pv-ai-root .turn .msg { font-size: .95rem; line-height: 1.55; padding-bottom: 10px; border-bottom: 1px dotted var(--rule); }
        
        .pv-ai-root .next-wrap { margin-top: 6px; }
        .pv-ai-root .next-wrap button {
          font-family: var(--font-mono); font-size: .7rem; letter-spacing: .06em; background: var(--paper-raised);
          border: 1px solid var(--ink); padding: 9px 14px; border-radius: 2px; cursor: pointer; color: var(--ink);
        }
        .pv-ai-root .next-wrap button:hover { background: var(--ink); color: var(--paper-raised); }
        
        .pv-ai-root .requisition {
          margin-top: 18px; border: 1px solid var(--ink); background: var(--paper-raised); border-radius: 2px;
          box-shadow: 4px 4px 0 rgba(255,255,255,.05); animation: pv-rise .5s ease forwards; overflow: hidden;
        }
        .pv-ai-root .requisition .rq-head {
          font-family: var(--font-mono); font-size: .66rem; letter-spacing: .16em; text-transform: uppercase;
          background: var(--ink); color: var(--paper-raised); padding: 8px 14px;
        }
        .pv-ai-root .requisition .rq-body { padding: 16px; }
        .pv-ai-root .rq-row { display: grid; grid-template-columns: 100px 1fr; gap: 10px; font-size: .88rem; padding: 5px 0; }
        .pv-ai-root .rq-row .k { font-family: var(--font-mono); font-size: .68rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .06em; padding-top: 2px; }
        .pv-ai-root .rq-row .v.quote { font-style: italic; }
        .pv-ai-root .req-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--rule); }
        .pv-ai-root .req-actions button { font-family: var(--font-mono); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; padding: 9px 16px; border-radius: 2px; cursor: pointer; }
        .pv-ai-root .req-actions .cancel { background: none; border: 1px solid var(--rule); color: var(--ink-soft); }
        .pv-ai-root .req-actions .confirm { background: var(--stamp-red); border: 1px solid var(--stamp-red); color: #fff; }
        .pv-ai-root .req-actions .confirm:disabled { opacity: .45; cursor: default; }
        
        .pv-ai-root .result-wrap { display: flex; align-items: center; gap: 18px; padding: 18px 16px; }
        .pv-ai-root .stamp {
          width: 96px; height: 96px; border: 3px solid var(--verify); border-radius: 50%; color: var(--verify);
          display: flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0;
          font-family: var(--font-mono); font-weight: 600; font-size: .62rem; letter-spacing: .06em; line-height: 1.3;
          animation: pv-stampPress .55s cubic-bezier(.2,1.4,.4,1) forwards;
          box-shadow: 0 0 0 3px var(--verify-soft) inset;
        }
        @keyframes pv-stampPress { 0% {opacity:0; transform:rotate(-9deg) scale(1.7);} 60% {opacity:1;} 100% {opacity:1; transform:rotate(-9deg) scale(1);} }
        .pv-ai-root .result-text { font-size: .94rem; line-height: 1.5; }
        .pv-ai-root .result-text b { font-family: var(--font-mono); }
        
        .pv-ai-root .context-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .pv-ai-root .context-chips .chip {
          font-family: var(--font-mono); font-size: .66rem; border: 1px solid var(--rule); border-radius: 20px;
          padding: 5px 11px; color: var(--ink-soft);
        }
        
        .pv-ai-root footer.notes { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--rule); font-family: var(--font-mono); font-size: .68rem; color: var(--ink-soft); line-height: 1.7; }
        .hidden { display: none !important; }
      `}</style>
      
      <div className="sheet">
        <header className="masthead">
          <div className="brand">PrepVista<small>AI PLACEMENT OFFICER — DEMO DOSSIER</small></div>
          <div className="meta">Sunrise Institute of Technology<br/>Season 2026 · TPO: Priya Menon</div>
        </header>

        <div className="command">
          <span className="glyph">⌕</span>
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask PrepVista anything…" 
            aria-label="Ask PrepVista anything"
          />
          <button onClick={handleGo} type="button">Ask</button>
        </div>
        <div className="suggested">
          {["What needs attention?", "Why is placement below target?", "Show today's priorities", "Generate today's briefing"].map(q => (
            <button key={q} type="button" onClick={() => setInputValue(q)}>{q}</button>
          ))}
        </div>

        <section className="block">
          <div className="block-label">Morning briefing · 15 Aug 2026</div>
          <p className="greeting">"Good morning. I found 6 things worth your attention."</p>
          <div id="briefingList">
            {briefing.map((b, i) => (
              <div key={i} className={`entry ${b.tag || ''}`} style={{ animationDelay: `${i * 0.09}s` }}>
                <div className="no">No.<b>{String(i+1).padStart(2,'0')}</b></div>
                <div>
                  <div className="cat">
                    {b.cat}
                    {b.tag && <span className={`tag ${b.tag}`}>{b.tagLabel}</span>}
                  </div>
                  <div className="detail">{b.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-label">Conversation</div>
          <div className="thread">
            {activeSteps.map((s, idx) => (
              <div key={idx} className={`turn ${s.who}`}>
                <div className="who">{s.label}</div>
                <div className="msg">{s.text}</div>
              </div>
            ))}
          </div>
          <div className="next-wrap">
            {nextStepInfo && (
              <button type="button" onClick={handleNext}>
                ▸ {nextStepInfo.who === 'tpo' ? nextStepInfo.text : 'Continue'}
              </button>
            )}
          </div>
        </section>

        {reqVisible && (
          <section className="block">
            <div className="block-label">Action</div>
            <div className="requisition">
              <div className="rq-head">Requisition — Send Reminder</div>
              <div className="rq-body">
                <div className="rq-row"><div className="k">Audience</div><div className="v">83 students (unapplied, eligible — ABC Technologies)</div></div>
                <div className="rq-row"><div className="k">Channel</div><div className="v">In-app</div></div>
                <div className="rq-row"><div className="k">Message</div><div className="v quote">"Reminder: applications for ABC Technologies (Software Engineer) close today. You are eligible but haven't applied yet — apply now to be considered."</div></div>
              </div>
              <div className="req-actions">
                <button className="cancel" type="button" onClick={() => setReqVisible(false)}>Cancel</button>
                <button className="confirm" type="button" onClick={handleConfirm} disabled={btnConfirmed}>
                  {btnConfirmed ? 'Sent \u2713' : 'Confirm Send'}
                </button>
              </div>
              {resultVisible && (
                <div className="result-wrap">
                  <div className="stamp">SENT<br/>81 / 83</div>
                  <div className="result-text"><b>83</b> messages sent.<br/><b>81</b> delivered, <b>2</b> failed.</div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="block">
          <div className="block-label">Ask about this</div>
          <div className="context-chips">
            <span className="chip">ABC Technologies — Drive</span>
            <span className="chip">23 high-readiness students</span>
            <span className="chip">ECE — Department</span>
            <span className="chip">Communication Bootcamp</span>
          </div>
        </section>
      </div>
    </div>
  );
}
