import fs from "node:fs";
import path from "node:path";

process.env.SQLITE_FILE_PATH = path.join(__dirname, "..", "data", "preview.sqlite");

import { resetDbForTests } from "../src/db/database";
import { migrate } from "../src/db/migrate";
import { DEMO, seedFixtureData } from "../src/db/seed-data";
import { buildFixtureIntelligencePorts } from "../src/adapters/fixture-adapters";
import { DEMO_USERS } from "../src/testing/test-tokens";
import { drainQueue } from "../src/jobs/queue";
import { requestReport } from "../src/services/report-generation-service";
import { getReportById } from "../src/services/report-repository";
import { MASTERY_LEVEL_ORDER } from "../src/domain/enums";
import type { SkillMasteryEntry, TechnicalMasteryReportDto } from "../src/domain/dto";

const OUT_DIR = path.join(__dirname, "..", "..", "preview");

async function main() {
  resetDbForTests();
  migrate();
  seedFixtureData();

  const ports = buildFixtureIntelligencePorts();
  const { report } = await requestReport(ports, DEMO_USERS.studentGolden, DEMO.studentGolden);
  await drainQueue(ports);
  const fetched = getReportById(report.id);
  if (!fetched?.dto) throw new Error("Preview generation failed: report did not complete");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "golden-student-report.json"), JSON.stringify(fetched.dto, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "technical-mastery-report-preview.html"), renderHtml(fetched.dto));

  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUT_DIR}/golden-student-report.json`);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUT_DIR}/technical-mastery-report-preview.html`);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function gauge(level: string): string {
  const idx = MASTERY_LEVEL_ORDER.indexOf(level as never);
  const ticks = MASTERY_LEVEL_ORDER.map((_, i) => {
    const filled = i <= idx;
    return `<span class="tick ${filled ? "tick--filled" : ""}"></span>`;
  }).join("");
  return `<div class="gauge" title="${esc(level)}">${ticks}</div>`;
}

function trendGlyph(trend: string): string {
  if (trend === "UP") return `<span class="trend trend--up">&#8599; up</span>`;
  if (trend === "DOWN") return `<span class="trend trend--down">&#8600; down</span>`;
  if (trend === "STABLE") return `<span class="trend trend--stable">&#8594; stable</span>`;
  return `<span class="trend trend--unknown">insufficient data</span>`;
}

function skillRow(s: SkillMasteryEntry): string {
  const gapBadge =
    s.gapStatus === "BLOCKING_GAP"
      ? `<span class="badge badge--blocking">Blocking gap</span>`
      : s.gapStatus === "GAP"
        ? `<span class="badge badge--gap">Gap</span>`
        : "";
  return `
  <div class="skill-row">
    <div class="skill-row__name">
      <span class="mono skill-row__idx">${esc(s.skillId)}</span>
      <span>${esc(s.skillName)}</span>
      ${gapBadge}
    </div>
    ${gauge(s.masteryLevel)}
    <div class="skill-row__level">${titleCase(s.masteryLevel)}</div>
    <div class="skill-row__meta">
      ${trendGlyph(s.trend)}
      <span class="dot">&middot;</span>
      <span>${titleCase(s.evidenceStrength)} evidence</span>
      <span class="mono evidence-count">(${s.evidenceCount})</span>
    </div>
  </div>`;
}

function renderHtml(dto: TechnicalMasteryReportDto): string {
  const skillRows = dto.skills.map(skillRow).join("\n");

  const roleCards = dto.roles
    .map(
      (r) => `
    <div class="card">
      <div class="card__row">
        <h3>${esc(r.roleName)}</h3>
        <span class="pill pill--${r.readiness.toLowerCase()}">${titleCase(r.readiness)}</span>
      </div>
      ${r.readyAreas.length ? `<p class="card__line"><strong>Ready:</strong> ${r.readyAreas.map(esc).join(", ")}</p>` : ""}
      ${r.developingAreas.length ? `<p class="card__line"><strong>Developing:</strong> ${r.developingAreas.map(esc).join(", ")}</p>` : ""}
      ${r.blockingGaps.length ? `<p class="card__line card__line--alert"><strong>Blocking:</strong> ${r.blockingGaps.map(esc).join(", ")}</p>` : ""}
    </div>`,
    )
    .join("\n");

  const gapCards = dto.gaps
    .map(
      (g) => `
    <div class="card card--gap">
      <div class="card__row">
        <h3>${esc(g.skillName)}</h3>
        <span class="mono card__transition">${titleCase(g.currentState)} &rarr; ${titleCase(g.expectedState)}</span>
      </div>
      <p class="card__line">${esc(g.roleImpact)}</p>
      <p class="card__line card__line--muted">${esc(g.recommendedAction)}</p>
    </div>`,
    )
    .join("\n");

  const strengthItems = dto.strengths
    .map(
      (s) => `
    <li class="evidence-item">
      <div class="evidence-item__title">${esc(s.title)}</div>
      <div class="evidence-item__refs">${s.evidenceRefs.map(esc).join(" &middot; ")}</div>
    </li>`,
    )
    .join("\n");

  const weaknessItems = dto.weaknesses
    .map(
      (w) => `
    <li class="evidence-item">
      <div class="evidence-item__title">${esc(w.title)}</div>
      <div class="evidence-item__refs">${esc(w.impact)}</div>
      <div class="evidence-item__action">&rarr; ${esc(w.recommendedAction)}</div>
    </li>`,
    )
    .join("\n");

  const nextActions = dto.recommendations
    .map(
      (a, i) => `
    <li class="action-item">
      <span class="action-item__priority mono">P${a.priority ?? i + 1}</span>
      <div>
        <div class="action-item__title">${esc(a.action)}</div>
        <div class="action-item__why">${esc(a.why)}</div>
      </div>
    </li>`,
    )
    .join("\n");

  const growthItems = dto.growth.insufficientData
    ? `<p class="empty-state">Not enough historical data yet to show a growth timeline.</p>`
    : `<ol class="timeline">${dto.growth.timeline
        .map(
          (e) => `
      <li class="timeline__item">
        <span class="mono timeline__date">${new Date(e.occurredAt).toLocaleDateString()}</span>
        <span>${esc(e.skillName)}: ${titleCase(e.fromLevel)} &rarr; ${titleCase(e.toLevel)}</span>
        ${e.note ? `<span class="timeline__note">${esc(e.note)}</span>` : ""}
      </li>`,
        )
        .join("\n")}</ol>`;

  const evidenceCategories: string[] = [];
  if (dto.evidence.coding) {
    evidenceCategories.push(`
    <div class="evidence-block">
      <h4>Coding</h4>
      <p>${esc(dto.evidence.coding.correctness ?? "")}</p>
      <p class="card__line--muted">${esc(dto.evidence.coding.problemSolving ?? "")}</p>
    </div>`);
  }
  if (dto.evidence.debugging) {
    evidenceCategories.push(`
    <div class="evidence-block">
      <h4>Debugging</h4>
      <p>${esc(dto.evidence.debugging.capability ?? "")}</p>
      <p class="card__line--muted">${esc(dto.evidence.debugging.commonWeakness ?? "")}</p>
    </div>`);
  }
  if (dto.evidence.reasoning) {
    evidenceCategories.push(`
    <div class="evidence-block">
      <h4>Reasoning &amp; Understanding</h4>
      <p>${esc(dto.evidence.reasoning.reasoningNote ?? "")}</p>
      <p class="card__line--muted">${esc(dto.evidence.reasoning.understandingNote ?? "")}</p>
    </div>`);
  }
  if (dto.evidence.projects.length) {
    evidenceCategories.push(`
    <div class="evidence-block">
      <h4>Projects</h4>
      ${dto.evidence.projects
        .map((p) => `<p><strong>${esc(p.projectName)}</strong> &mdash; ${esc(p.technicalDepth)}</p>`)
        .join("\n")}
    </div>`);
  }
  if (dto.evidence.interviews.length) {
    evidenceCategories.push(`
    <div class="evidence-block">
      <h4>Technical Interviews</h4>
      ${dto.evidence.interviews.map((iv) => `<p><strong>${esc(iv.interviewName)}</strong> &mdash; ${esc(iv.outcome)}</p>`).join("\n")}
    </div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Technical Mastery Report — ${esc(dto.identity.studentName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --ink-bg: #10141B;
    --ink-surface: #1A202B;
    --ink-surface-2: #212938;
    --ink-border: rgba(255,255,255,0.08);
    --ink-text: #ECE8DF;
    --ink-text-muted: #9AA1AE;
    --accent-brass: #C9975A;
    --accent-teal: #5CB8B2;
    --accent-rose: #D97A6C;
    --font-display: 'Fraunces', Georgia, serif;
    --font-body: 'IBM Plex Sans', -apple-system, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ink-bg);
    color: var(--ink-text);
    font-family: var(--font-body);
    line-height: 1.5;
  }
  .mono { font-family: var(--font-mono); }
  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    max-width: 1200px;
    margin: 0 auto;
    min-height: 100vh;
  }
  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
    .rail { position: static !important; border-right: none !important; border-bottom: 1px solid var(--ink-border); }
  }
  .rail {
    position: sticky;
    top: 0;
    align-self: start;
    border-right: 1px solid var(--ink-border);
    padding: 32px 24px;
  }
  .rail__eyebrow {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-brass);
    margin: 0 0 6px;
  }
  .rail__name {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .rail__org { color: var(--ink-text-muted); font-size: 14px; margin: 0 0 24px; }
  .rail__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--ink-surface);
    border: 1px solid var(--ink-border);
    font-size: 12px;
    margin-bottom: 20px;
  }
  .rail__status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-teal); }
  .rail__meta { font-size: 11px; color: var(--ink-text-muted); line-height: 1.8; }
  .rail__meta div { display: flex; justify-content: space-between; gap: 8px; }
  .main { padding: 32px 32px 80px; }
  section { margin-bottom: 44px; }
  h2.section-title {
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    margin: 0 0 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ink-border);
  }
  .summary-narrative {
    font-size: 15.5px;
    color: var(--ink-text);
    max-width: 68ch;
    margin: 0 0 18px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }
  .stat {
    background: var(--ink-surface);
    border: 1px solid var(--ink-border);
    border-radius: 8px;
    padding: 14px;
  }
  .stat__label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-text-muted); margin-bottom: 6px; }
  .stat__value { font-family: var(--font-display); font-size: 18px; font-weight: 600; }
  .skill-row {
    display: grid;
    grid-template-columns: minmax(180px, 1.4fr) auto 110px 1fr;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--ink-border);
  }
  .skill-row__name { display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .skill-row__idx { display: none; }
  .skill-row__level { color: var(--accent-brass); font-size: 13px; font-weight: 500; }
  .skill-row__meta { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-text-muted); }
  .dot { opacity: 0.5; }
  .evidence-count { color: var(--ink-text-muted); }
  .gauge { display: flex; gap: 3px; }
  .tick { width: 14px; height: 8px; border-radius: 2px; background: var(--ink-surface-2); border: 1px solid var(--ink-border); }
  .tick--filled { background: var(--accent-brass); border-color: var(--accent-brass); }
  .badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 7px;
    border-radius: 999px;
  }
  .badge--blocking { background: rgba(217,122,108,0.18); color: var(--accent-rose); }
  .badge--gap { background: rgba(201,151,90,0.18); color: var(--accent-brass); }
  .trend--up { color: var(--accent-teal); }
  .trend--down { color: var(--accent-rose); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  .card {
    background: var(--ink-surface);
    border: 1px solid var(--ink-border);
    border-radius: 10px;
    padding: 16px;
  }
  .card--gap { border-left: 3px solid var(--accent-rose); }
  .card h3 { margin: 0; font-size: 15px; font-family: var(--font-display); font-weight: 600; }
  .card__row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .card__line { font-size: 13px; margin: 4px 0; }
  .card__line--muted { color: var(--ink-text-muted); }
  .card__line--alert { color: var(--accent-rose); }
  .card__transition { font-size: 11px; color: var(--ink-text-muted); white-space: nowrap; }
  .pill { font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--ink-border); }
  .pill--ready { color: var(--accent-teal); border-color: var(--accent-teal); }
  .pill--near_ready { color: var(--accent-brass); border-color: var(--accent-brass); }
  .pill--developing, .pill--insufficient_data { color: var(--ink-text-muted); }
  .pill--not_ready { color: var(--accent-rose); border-color: var(--accent-rose); }
  .evidence-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
  .evidence-block h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent-brass); }
  .evidence-block p { margin: 4px 0; font-size: 13.5px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }
  ul.evidence-list, ol.timeline, ul.action-list { list-style: none; margin: 0; padding: 0; }
  .evidence-item { padding: 12px 0; border-bottom: 1px solid var(--ink-border); }
  .evidence-item__title { font-weight: 500; margin-bottom: 3px; }
  .evidence-item__refs { font-size: 12px; color: var(--ink-text-muted); }
  .evidence-item__action { font-size: 12.5px; color: var(--accent-teal); margin-top: 4px; }
  .timeline__item { display: flex; gap: 12px; padding: 8px 0; font-size: 13.5px; align-items: baseline; flex-wrap: wrap; }
  .timeline__date { color: var(--ink-text-muted); font-size: 11px; min-width: 90px; }
  .timeline__note { color: var(--ink-text-muted); font-size: 12px; }
  .action-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--ink-border); }
  .action-item__priority {
    color: var(--accent-brass);
    font-size: 11px;
    border: 1px solid var(--ink-border);
    border-radius: 6px;
    padding: 2px 6px;
    height: fit-content;
  }
  .action-item__title { font-weight: 500; font-size: 14px; }
  .action-item__why { font-size: 12.5px; color: var(--ink-text-muted); margin-top: 2px; }
  .empty-state { color: var(--ink-text-muted); font-size: 13.5px; font-style: italic; }
  .footer-note { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--ink-border); font-size: 11px; color: var(--ink-text-muted); }
</style>
</head>
<body>
<div class="layout">
  <aside class="rail">
    <p class="rail__eyebrow">Technical Mastery Report</p>
    <h1 class="rail__name">${esc(dto.identity.studentName)}</h1>
    <p class="rail__org">${esc(dto.organization.orgName)}</p>
    <div class="rail__status"><span class="rail__status-dot"></span> ${titleCase(dto.freshness)}</div>
    <div class="rail__meta">
      <div><span>Report</span><span class="mono">${esc(dto.metadata.reportId.slice(0, 8))}&hellip;</span></div>
      <div><span>Schema</span><span class="mono">v${esc(dto.metadata.schemaVersion)}</span></div>
      <div><span>Source data</span><span class="mono">v${dto.metadata.sourceDataVersion}</span></div>
      <div><span>Generated</span><span class="mono">${new Date(dto.metadata.generatedAt).toLocaleDateString()}</span></div>
      <div><span>Narrative</span><span class="mono">${dto.narrative.source}</span></div>
    </div>
  </aside>

  <main class="main">
    <section>
      <h2 class="section-title">Executive Summary</h2>
      <p class="summary-narrative">${esc(dto.narrative.executiveSummary)}</p>
      <div class="summary-grid">
        <div class="stat"><div class="stat__label">Overall Mastery</div><div class="stat__value">${dto.mastery.overallLevel ? titleCase(dto.mastery.overallLevel) : "Not yet available"}</div></div>
        <div class="stat"><div class="stat__label">Target Role</div><div class="stat__value">${dto.summary.targetRole ? esc(dto.summary.targetRole) : "Not set"}</div></div>
        <div class="stat"><div class="stat__label">Readiness</div><div class="stat__value">${dto.summary.roleReadiness ? titleCase(dto.summary.roleReadiness) : "Not yet available"}</div></div>
        <div class="stat"><div class="stat__label">Next Action</div><div class="stat__value" style="font-size:13px; font-family: var(--font-body); font-weight: 500;">${dto.summary.nextBestAction ? esc(dto.summary.nextBestAction) : "None currently"}</div></div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Skill Mastery Map</h2>
      ${skillRows}
    </section>

    <section>
      <h2 class="section-title">Target Role Readiness</h2>
      <div class="cards">${roleCards}</div>
    </section>

    <section>
      <h2 class="section-title">Skill Gaps</h2>
      <div class="cards">${gapCards || `<p class="empty-state">No notable gaps currently on record.</p>`}</div>
    </section>

    <section>
      <h2 class="section-title">Evidence Summary</h2>
      <div class="evidence-grid">${evidenceCategories.join("\n") || `<p class="empty-state">No evidence on record yet.</p>`}</div>
    </section>

    <section>
      <h2 class="section-title">Technical Growth</h2>
      ${growthItems}
    </section>

    <section class="two-col">
      <div>
        <h2 class="section-title">Strengths</h2>
        <ul class="evidence-list">${strengthItems || `<p class="empty-state">No skill currently meets the evidence threshold to be listed as a strength.</p>`}</ul>
      </div>
      <div>
        <h2 class="section-title">Weaknesses &amp; Next Steps</h2>
        <ul class="evidence-list">${weaknessItems || `<p class="empty-state">No notable gaps currently on record.</p>`}</ul>
      </div>
    </section>

    <section>
      <h2 class="section-title">Next Best Actions</h2>
      <ul class="action-list">${nextActions}</ul>
    </section>

    <p class="footer-note">
      Reference build &middot; fixture data, not a real student &middot; generated ${new Date(dto.metadata.generatedAt).toLocaleString()}
    </p>
  </main>
</div>
</body>
</html>`;
}

main();
