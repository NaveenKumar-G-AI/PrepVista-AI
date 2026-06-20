'use client';
/**
 * IntelDashboard — the Interview Intelligence Dashboard ported from the
 * interview_intelligence_dashboard mock to live React + ECharts. Self-contained
 * dark panel (its own scoped CSS under `.iid`), driven entirely by buildIntel()
 * over the real report payload. Charts with no real source render nothing.
 *
 * Insight notes are derived from the live model — not the mock's hardcoded copy —
 * so they never contradict the numbers on screen.
 */
import { useMemo, type ReactNode } from 'react';
import { EChart } from '@/components/charts/echart';
import { buildIntel, COLORS, type IntelReport, type IntelModel } from './model';
import {
  radarOption, momentumOption, timingOption, decayOption,
  donutOption, scissorOption, fearOption, missingOption, waterfallOption,
} from './options';

type Tone = 'blue' | 'green' | 'amber' | 'red';

function Card({ n, tone, title, sub, pills, legend, height, note, full, empty, emptyText, children }: {
  n: string; tone: Tone; title: string; sub: string;
  pills?: string[]; legend?: ReactNode; height: number;
  note?: { tone: Tone; text: ReactNode }; children: ReactNode; full?: boolean;
  empty?: boolean; emptyText?: string;
}) {
  return (
    <div className={`iid-card${full ? ' full' : ''}`}>
      <div className="iid-head">
        <span className={`iid-badge b-${tone}`}>{n}</span>
        <div>
          <div className="iid-title">{title}</div>
          <div className="iid-sub">{sub}</div>
        </div>
      </div>
      {pills && pills.length > 0 && (
        <div className="iid-pills">{pills.map(p => <span key={p} className="iid-pill">{p}</span>)}</div>
      )}
      {legend && !empty && <div className="iid-cleg">{legend}</div>}
      <div style={height > 0 ? { height } : undefined}>
        {empty
          ? <div className="iid-empty">{emptyText || 'Not enough data was captured in this session to plot this chart yet.'}</div>
          : children}
      </div>
      {note && !empty && <div className={`iid-note n-${note.tone}`}>{note.text}</div>}
    </div>
  );
}

const LDot = ({ c, children }: { c: string; children: ReactNode }) => (
  <span className="iid-ci"><span className="iid-cdot" style={{ background: c }} />{children}</span>
);
const LLine = ({ c, dashed, children }: { c: string; dashed?: boolean; children: ReactNode }) => (
  <span className="iid-ci"><span className="iid-cln" style={dashed ? { borderTop: `2px dashed ${c}`, height: 0 } : { background: c }} />{children}</span>
);

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// Cell colour bucket for the heatmap (0–10 scale, mock thresholds).
const heatClass = (v: number) => (v >= 7.5 ? 'c-s' : v >= 6 ? 'c-d' : v >= 4.5 ? 'c-w' : 'c-c');

export function IntelDashboard({ report }: { report: IntelReport }) {
  const m: IntelModel = useMemo(() => buildIntel(report), [report]);

  // Always render all 12 cards; each shows an honest empty state when its source
  // data is missing, so a sparse or abandoned session still shows the full layout.
  const noTurns = m.turnCount === 0;

  // ── derived insight copy (real numbers) ───────────────────────────────────
  const vagueSilent = m.classification.filter(c => c.name === 'Vague' || c.name === 'Silent').reduce((s, c) => s + c.value, 0);
  const peakIdx = m.momentum.values.indexOf(Math.max(...m.momentum.values));
  const lastVal = m.momentum.values[m.momentum.values.length - 1] ?? 0;
  const peakVal = m.momentum.values[peakIdx] ?? 0;
  const dropPct = peakVal > 0 ? Math.round(((peakVal - lastVal) / peakVal) * 100) : 0;
  const gapToStrong = Math.max(0, 70 - m.finalScore);
  const topMissing = m.missing[0];
  const biggestPos = [...m.waterfall.labels.map((l, i) => ({ l, v: m.waterfall.values[i], k: m.waterfall.kinds[i] }))]
    .filter(x => x.k === 'pos').sort((a, b) => b.v - a.v)[0];
  // weakest heatmap cell
  const flatCells = m.heatCells.flatMap((row, ti) => row.map((v, di) => ({ topic: m.heatTopics[ti], dim: m.heatDims[di], v })));
  const weakCell = flatCells.length ? flatCells.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  // fear: topic skipped most that still scored decently
  const fearIdx = m.fear.skipped.reduce((best, v, i) => (v > (m.fear.skipped[best] ?? -1) ? i : best), 0);

  return (
    <div className="iid">
      <style>{CSS}</style>

      <div className="iid-legend">
        <LDot c="#A78BFA">Performance</LDot>
        <LDot c="#34D399">Behaviour</LDot>
        <LDot c="#FC8181">Risk signal</LDot>
        <LDot c="#FCD34D">Hidden insight</LDot>
      </div>

      <div className="iid-grid">
        {/* 01 radar */}
        <Card n="01" tone="blue" title="Answer quality fingerprint"
          sub="Relevance · clarity · specificity · structure — your average across the session"
          pills={['relevance', 'clarity', 'specificity', 'structure']}
          legend={<><LLine c={COLORS.purple}>Your avg</LLine><LLine c={COLORS.teal} dashed>Ideal target</LLine></>}
          height={272} empty={noTurns}
          note={m.weakestDim ? { tone: 'blue', text: <><strong>Hidden insight — </strong>{m.weakestDim.label} is your weakest dimension at {m.weakestDim.value}/10. Lifting it toward the 8.5 target reshapes this radar the fastest — close every answer with one concrete, quantified detail.</> } : undefined}>
          <EChart option={radarOption(m)} />
        </Card>

        {/* 02 momentum */}
        <Card n="02" tone="blue" title="Session momentum curve"
          sub="Score arc across every turn — peak window and fatigue zone"
          pills={['score (per turn)', 'total_turns']}
          legend={<><LDot c={COLORS.teal}>Strong ≥75</LDot><LDot c={COLORS.purple}>Partial 55–74</LDot><LDot c={COLORS.red}>Weak &lt;55</LDot></>}
          height={250} empty={noTurns}
          note={{ tone: dropPct >= 20 ? 'amber' : 'green', text: <><strong>Hidden insight — </strong>Peak was Q{peakIdx + 1} ({peakVal}). {dropPct > 0 ? <>Your score finishes {dropPct}% below that peak — train for longer sessions to extend your endurance window.</> : <>You held your level to the end — strong stamina.</>}</> }}>
          <EChart option={momentumOption(m)} />
        </Card>

        {/* 03 timing scatter */}
        <Card n="03" tone="amber" title="Response timing intelligence map"
          sub="Think-time vs answer score — reveals your cognitive sweet spot"
          pills={['answer_duration_seconds', 'classification', 'score']}
          legend={<>{m.timing.map(g => <LDot key={g.cls} c={g.hex}>{g.label}</LDot>)}</>}
          height={262} empty={!m.hasTiming}
          emptyText="Per-answer response times weren’t recorded for this session, so the timing map has no data to plot."
          note={{ tone: 'amber', text: <><strong>Hidden insight — </strong>Each dot is one answer: how long you took (x) against how it scored (y). Clusters far right that score low signal over-thinking; very fast + low signals impulsive answers.</> }}>
          <EChart option={timingOption(m)} />
        </Card>

        {/* 04 decay */}
        <Card n="04" tone="red" title="Confidence decay pattern"
          sub="Response time per turn — the cognitive-fatigue curve across the session"
          pills={['answer_duration_seconds', 'per_question_response_times']}
          legend={<><LDot c={COLORS.teal}>Fast &lt;20s</LDot><LDot c={COLORS.amber}>Slow 20–40s</LDot><LDot c={COLORS.red}>Critical &gt;40s</LDot></>}
          height={244} empty={!m.hasDecay}
          emptyText="No per-turn response times were captured for this session, so the fatigue curve can’t be drawn."
          note={{ tone: 'red', text: <><strong>Risk signal — </strong>Watch for a rising trend: growing response times late in the session point to fatigue, not knowledge gaps. A 30-second reset between questions measurably flattens this curve.</> }}>
          <EChart option={decayOption(m)} />
        </Card>

        {/* 06 follow-up depth — no source in the report payload, shown as an honest empty card */}
        <Card n="06" tone="red" title="Rabbit-hole collapse by follow-up depth"
          sub="How answer quality holds up as the interviewer drills deeper into a topic"
          pills={['follow_up_depth', 'score']}
          height={244} empty
          emptyText="Per-turn follow-up depth isn’t captured in this session’s data, so this chart has no source to draw from yet.">
          <span />
        </Card>

        <div className="iid-divider" />

        {/* 05 heatmap */}
        <Card n="05" tone="amber" title="Topic × skill heatmap — the blind-spot matrix"
            sub="Every topic crossed with all four scoring dimensions (0–10)"
            pills={['rubric_category', 'relevance', 'clarity', 'specificity', 'structure']}
            empty={!m.hasHeat} emptyText="No per-topic rubric scores were captured for this session, so the blind-spot matrix has nothing to show yet."
            height={0} full
            note={weakCell ? { tone: 'amber', text: <><strong>Hidden insight — </strong>Your weakest cell is <strong>{weakCell.dim}</strong> in <strong>{weakCell.topic}</strong> ({weakCell.v}/10). Prepare one concrete story for that topic with a measurable outcome to lift it.</> } : undefined}>
            <div className="iid-heat-wrap">
              <table className="iid-heat">
                <thead><tr><th /><th>Relevance</th><th>Clarity</th><th>Specificity</th><th>Structure</th></tr></thead>
                <tbody>
                  {m.heatTopics.map((t, ti) => (
                    <tr key={t}>
                      <td className="rl">{t}</td>
                      {m.heatCells[ti].map((v, di) => <td key={di} className={heatClass(v)}>{v.toFixed(1)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="iid-heat-legend">
              <span><i style={{ background: 'rgba(16,185,129,.22)' }} />Strong ≥7.5</span>
              <span><i style={{ background: 'rgba(139,92,246,.22)' }} />Decent 6.0–7.4</span>
              <span><i style={{ background: 'rgba(245,158,11,.22)' }} />Weak 4.5–5.9</span>
              <span><i style={{ background: 'rgba(239,68,68,.28)' }} />Critical &lt;4.5</span>
            </div>
        </Card>

        <div className="iid-divider" />

        {/* 07 classification donut */}
        <Card n="07" tone="green" title="Answer classification breakdown"
          sub="Distribution of strong · partial · vague · silent across the session"
          pills={['classification', 'answer_status']}
          height={252} empty={m.classification.length === 0}
          note={{ tone: 'green', text: <><strong>Behaviour insight — </strong>{vagueSilent} of {m.turnCount} answers ({pct(vagueSilent, m.turnCount)}%) were vague or silent. Recruiters mentally fail a candidate after two consecutive weak answers — a partial answer always beats silence.</> }}>
          <EChart option={donutOption(m)} />
        </Card>

        {/* 08 scissor */}
        <Card n="08" tone="red" title="Communication–content scissor effect"
          sub="Where delivery confidence and answer substance diverge — the most dangerous interview gap"
          pills={['communication_score', 'relevance', 'clarity', 'specificity', 'structure']}
          height={236} empty={noTurns}
          legend={<><LLine c={COLORS.teal}>Communication</LLine><LLine c={COLORS.red}>Content avg</LLine></>}
          note={{ tone: 'red', text: <><strong>Risk signal — </strong>When the teal line stays high while the red line drops, you sound confident but say less — the &quot;sounds good, means little&quot; trap. Keep substance rising with delivery.</> }}>
          <EChart option={scissorOption(m)} />
        </Card>

        {/* 09 fear vs reality */}
        <Card n="09" tone="amber" title="Fear vs reality — topic avoidance map"
          sub="Times skipped vs the score you actually earn when you attempt the topic"
          pills={['classification = silent', 'rubric_category', 'score']}
          height={292} empty={!m.hasFear}
          emptyText="No per-topic attempt/skip data was captured for this session, so the avoidance map is empty."
          legend={<><LDot c={COLORS.red}>Times skipped</LDot><LDot c={COLORS.purple}>Score when attempted</LDot></>}
          note={m.fear.skipped[fearIdx] > 0 ? { tone: 'amber', text: <><strong>Hidden insight — </strong>You skipped <strong>{m.fear.topics[fearIdx]}</strong> {m.fear.skipped[fearIdx]}× yet scored {m.fear.scoreWhenAttempted[fearIdx]} when you attempted it. Avoidance, not ability, is the bottleneck.</> } : { tone: 'green', text: <><strong>Behaviour insight — </strong>No topics were skipped — you engaged every question. That alone protects your real pass rate.</> }}>
          <EChart option={fearOption(m)} />
        </Card>

        {/* 10 readiness gauge */}
        <Card n="10" tone="blue" title="Technical readiness gauge"
          sub="Composite job-readiness score with zone classification"
          pills={['final_score', 'readiness band']}
          height={0}
          note={{ tone: 'blue', text: <><strong>Performance insight — </strong>{m.finalScore} = {m.readinessBand} readiness. {gapToStrong > 0 ? <>You&apos;re {gapToStrong} points from the Strong band (70+) — mostly closable through specificity, not new concepts.</> : <>You&apos;re in the Strong band — focus now on consistency under follow-up pressure.</>}</> }}>
          <div className="iid-gauge">
            <div className="iid-gauge-axis"><span>0</span><span>40</span><span>70</span><span>100</span></div>
            <div className="iid-gauge-track">
              <div className="gz-e" /><div className="gz-m" /><div className="gz-s" />
              <div className="iid-gauge-pin" style={{ left: `${m.finalScore}%` }}>
                <div className="pin-label">{m.finalScore}</div>
                <div className="pin-needle" />
              </div>
            </div>
            <div className="iid-gauge-zones"><div className="gz-le">Early</div><div className="gz-lm">Moderate</div><div className="gz-ls">Strong</div></div>
            <div className="iid-gauge-metrics">
              <div className="g-metric"><div className="g-label">Final score</div><div className="g-val" style={{ color: COLORS.amber }}>{m.finalScore}</div></div>
              <div className="g-metric"><div className="g-label">Gap to Strong</div><div className="g-val" style={{ color: gapToStrong ? COLORS.red : COLORS.teal }}>{gapToStrong ? `+${gapToStrong}` : '0'}</div></div>
              <div className="g-metric"><div className="g-label">Band</div><div className="g-val" style={{ color: COLORS.amber, fontSize: '1.05rem' }}>{m.readinessBand}</div></div>
            </div>
          </div>
        </Card>

        {/* 11 missing elements */}
        <Card n="11" tone="amber" title="Missing elements frequency — systemic gap analysis" full
          sub="What the evaluator found absent across your answers, ranked by frequency"
          pills={['missing_elements']}
          height={Math.max(240, m.missing.length * 44 + 60)} empty={!m.hasMissing}
          emptyText="The evaluator didn’t record any missing-element tags for this session, so there’s no gap analysis to chart."
          note={topMissing ? { tone: 'amber', text: <><strong>Hidden insight — </strong>&quot;{topMissing.label}&quot; was flagged in {topMissing.count} of {m.turnCount} answers — your highest-frequency gap. Fixing this one habit is the highest-ROI change available.</> } : undefined}>
          <EChart option={missingOption(m)} />
        </Card>

        {/* 12 waterfall */}
        <Card n="12" tone="blue" title={`Score contribution waterfall — what built your ${m.finalScore}`} full
          sub="Each dimension's positive contribution and each penalty's drag on the final score"
          pills={['rubric_scores', 'timeout_count', 'skipped_count', 'classification']}
          height={300} empty={noTurns}
          legend={<><LDot c={COLORS.purple}>Base / Final</LDot><LDot c={COLORS.teal}>Contribution</LDot><LDot c={COLORS.red}>Penalty</LDot></>}
          note={biggestPos ? { tone: 'blue', text: <><strong>Performance insight — </strong>{biggestPos.l.replace('+', '')} was your biggest positive (+{biggestPos.v}). Eliminating avoidable penalties — giving even a partial answer instead of silence — is the cleanest path past 70.</> } : undefined}>
          <EChart option={waterfallOption(m)} />
        </Card>
      </div>
    </div>
  );
}

// ── Scoped CSS (ported from the mock, namespaced under .iid) ──────────────────
const CSS = `
.iid { --b: rgba(255,255,255,0.07); --bh: rgba(255,255,255,0.14); color:#F0F4FF; }
.iid-legend { display:flex; flex-wrap:wrap; justify-content:center; gap:20px; margin:8px 0 24px; font-size:.8rem; color:#8A9BBF; }
.iid-ci { display:inline-flex; align-items:center; gap:6px; font-size:.72rem; color:#8A9BBF; }
.iid-cdot { width:10px; height:10px; border-radius:50%; display:inline-block; }
.iid-cln { display:inline-block; width:16px; height:3px; border-radius:1px; vertical-align:middle; }
.iid-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.iid-card { background:#0F1626; border:1px solid var(--b); border-radius:14px; padding:22px; transition:border-color .2s, box-shadow .2s; }
.iid-card:hover { border-color:var(--bh); box-shadow:0 0 0 1px rgba(139,92,246,.08); }
.iid-card.full, .iid-divider { grid-column:1 / -1; }
.iid-head { display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; }
.iid-badge { font-size:.68rem; font-weight:700; font-family:Consolas,monospace; letter-spacing:.06em; padding:3px 9px; border-radius:6px; flex-shrink:0; margin-top:2px; }
.iid-badge.b-blue { background:rgba(139,92,246,.18); color:#A78BFA; border:1px solid rgba(139,92,246,.32); }
.iid-badge.b-green { background:rgba(16,185,129,.15); color:#34D399; border:1px solid rgba(16,185,129,.28); }
.iid-badge.b-red { background:rgba(239,68,68,.15); color:#FC8181; border:1px solid rgba(239,68,68,.28); }
.iid-badge.b-amber { background:rgba(245,158,11,.15); color:#FCD34D; border:1px solid rgba(245,158,11,.28); }
.iid-title { font-size:.97rem; font-weight:700; margin-bottom:2px; }
.iid-sub { font-size:.75rem; color:#8A9BBF; line-height:1.4; }
.iid-pills { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px; }
.iid-pill { font-size:.67rem; padding:2px 8px; border-radius:20px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); color:#4E6080; }
.iid-cleg { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:10px; }
.iid-note { margin-top:14px; padding:11px 14px; border-left:2px solid; font-size:.74rem; color:#8A9BBF; line-height:1.65; }
.iid-note strong { font-weight:700; }
.iid-note.n-blue { background:rgba(139,92,246,.07); border-color:#8B5CF6; } .iid-note.n-blue strong { color:#A78BFA; }
.iid-note.n-green { background:rgba(16,185,129,.07); border-color:#10B981; } .iid-note.n-green strong { color:#34D399; }
.iid-note.n-red { background:rgba(239,68,68,.07); border-color:#EF4444; } .iid-note.n-red strong { color:#FC8181; }
.iid-note.n-amber { background:rgba(245,158,11,.07); border-color:#F59E0B; } .iid-note.n-amber strong { color:#FCD34D; }
.iid-divider { height:1px; background:linear-gradient(90deg, transparent, rgba(139,92,246,.2), transparent); margin:4px 0; }
.iid-empty { height:100%; min-height:170px; display:flex; align-items:center; justify-content:center; text-align:center; padding:18px 22px; font-size:.78rem; line-height:1.6; color:#5A6B8C; background:rgba(255,255,255,.015); border:1px dashed rgba(255,255,255,.09); border-radius:12px; }
.iid-heat-wrap { overflow-x:auto; }
.iid-heat { width:100%; border-collapse:separate; border-spacing:5px; font-size:.78rem; }
.iid-heat th { padding:5px 10px; color:#8A9BBF; font-weight:500; text-align:center; font-size:.72rem; }
.iid-heat .rl { text-align:left; color:#8A9BBF; font-weight:400; font-size:.74rem; padding-right:16px; white-space:nowrap; }
.iid-heat td:not(.rl) { text-align:center; border-radius:8px; padding:9px 14px; font-weight:700; font-family:Consolas,monospace; font-size:.82rem; }
.iid-heat .c-s { background:rgba(16,185,129,.22); color:#34D399; }
.iid-heat .c-d { background:rgba(139,92,246,.22); color:#A78BFA; }
.iid-heat .c-w { background:rgba(245,158,11,.22); color:#FCD34D; }
.iid-heat .c-c { background:rgba(239,68,68,.28); color:#FC8181; }
.iid-heat-legend { display:flex; gap:16px; margin-top:10px; font-size:.7rem; color:#8A9BBF; flex-wrap:wrap; }
.iid-heat-legend span { display:flex; align-items:center; gap:5px; }
.iid-heat-legend i { width:12px; height:12px; border-radius:3px; display:inline-block; }
.iid-gauge { padding:14px 0 6px; }
.iid-gauge-axis { display:flex; justify-content:space-between; font-size:.68rem; color:#4E6080; margin-bottom:5px; }
.iid-gauge-track { position:relative; height:28px; display:flex; border-radius:10px; overflow:hidden; }
.iid-gauge-track .gz-e { flex:40; background:rgba(239,68,68,.28); }
.iid-gauge-track .gz-m { flex:30; background:rgba(245,158,11,.28); }
.iid-gauge-track .gz-s { flex:30; background:rgba(16,185,129,.28); }
.iid-gauge-pin { position:absolute; top:-6px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; }
.iid-gauge-pin .pin-label { background:#fff; color:#111; font-size:.68rem; font-weight:800; font-family:Consolas,monospace; padding:2px 7px; border-radius:8px; margin-bottom:3px; }
.iid-gauge-pin .pin-needle { width:2px; height:40px; background:#fff; border-radius:1px; }
.iid-gauge-zones { display:flex; margin-top:5px; font-size:.7rem; font-weight:700; }
.iid-gauge-zones .gz-le { flex:40; text-align:center; color:#FC8181; }
.iid-gauge-zones .gz-lm { flex:30; text-align:center; color:#FCD34D; }
.iid-gauge-zones .gz-ls { flex:30; text-align:center; color:#34D399; }
.iid-gauge-metrics { margin-top:18px; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.iid-gauge-metrics .g-metric { text-align:center; padding:12px 8px; background:#172035; border:1px solid var(--b); border-radius:10px; }
.iid-gauge-metrics .g-label { font-size:.68rem; color:#4E6080; margin-bottom:5px; }
.iid-gauge-metrics .g-val { font-size:1.5rem; font-weight:800; font-family:Consolas,monospace; }
@media (max-width:780px) { .iid-grid { grid-template-columns:1fr; } .iid-card.full, .iid-divider { grid-column:1; } }
`;
