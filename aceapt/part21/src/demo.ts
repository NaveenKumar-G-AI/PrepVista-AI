// ============================================================
// DEMO — proves the pipeline runs end to end against the mock
// dataset, with no external services or API keys required.
//
// Run with: npm install && npm run demo
// ============================================================

import { MockUpstreamBundle } from './upstreamAdapters';
import { MOCK_DATASET, DIAGNOSIS_SCOPE, SKILLS } from './mockData';
import { runDiagnosisAndNextBestAction, explainTopBottleneck } from './orchestrator';
import { explainVerifiedIntervention, explainEscalation } from './explanationGenerator';
import { getVerifiedHistory, loadPastInterventionsBySkill } from './interventionMemory';
import { NextBestActionResult } from './types';

const provider = new MockUpstreamBundle(MOCK_DATASET);
const skillNames = new Map(SKILLS.map((s) => [s.id, s.name] as const));

function rule(title?: string): void {
  console.log('\n' + '─'.repeat(64));
  if (title) console.log(title);
}

function printResult(result: NextBestActionResult): void {
  rule(`STUDENT: ${result.student.name}   (goal: ${result.student.goal})`);
  console.log(`state: ${result.studentState}   fatigue: ${result.fatigue.isFatigued ? 'YES — ' + result.fatigue.reasons.join(' ') : 'no'}`);

  const topBottleneck = result.bottlenecks.find((b) => b.bottleneckScore > 0);
  if (topBottleneck) {
    rule('ROOT-CAUSE INSIGHT');
    console.log(explainTopBottleneck(result, SKILLS));
  }

  rule('PER-SKILL DIAGNOSIS');
  for (const report of result.diagnosisReports) {
    const top = report.hypotheses[0];
    console.log(`\n[${skillNames.get(report.skillId) ?? report.skillId}]  (${report.evidenceCount} evidence items)`);
    if (!top) {
      console.log('  no significant hypothesis — looks stable');
      continue;
    }
    console.log(`  ${top.category}  [${top.confidence}]`);
    for (const line of top.evidenceSummary) console.log(`   - ${line}`);
    if (report.hypotheses.length > 1) {
      console.log(`  (also considered: ${report.hypotheses.slice(1).map((h) => `${h.category}[${h.confidence}]`).join(', ')})`);
    }
    if (report.errorClusters.length > 0) {
      console.log(`  error clusters: ${report.errorClusters.map((c) => `${c.patternTag}×${c.count}`).join(', ')}`);
    }
  }

  rule('TOP RANKED ACTIONS');
  for (const a of result.rankedActions.slice(0, 5)) {
    console.log(
      `  ${a.score.toFixed(3)}  ${a.action.label.padEnd(24)} -> ${a.targetSkillId.padEnd(18)} (${a.diagnosisCategory}${a.isPrerequisiteRepair ? ', prereq repair' : ''})`
    );
  }

  rule("TODAY'S BEST ACTION");
  if (result.primaryAction) {
    console.log(`${result.primaryAction.action.label}  (~${result.primaryAction.action.baseDurationMinutes} min)  on "${result.primaryAction.targetSkillId}"\n`);
    console.log(result.primaryExplanation);
  } else {
    console.log(result.primaryExplanation);
  }

  if (result.recoveryPath && result.recoveryPath.length > 1) {
    rule('RECOVERY PATH (multi-step)');
    result.recoveryPath.forEach((step, i) => console.log(`  ${i + 1}. ${step.action.label} -> ${step.targetSkillId}`));
  }
}

for (const studentId of Object.keys(DIAGNOSIS_SCOPE)) {
  const result = runDiagnosisAndNextBestAction(provider, studentId, DIAGNOSIS_SCOPE[studentId]);
  printResult(result);
}

rule('VERIFICATION HISTORY — Priya');
const priyaHistory = getVerifiedHistory(loadPastInterventionsBySkill(provider, 'stu_priya', DIAGNOSIS_SCOPE['stu_priya']));
if (priyaHistory.length === 0) console.log('(none)');
for (const record of priyaHistory) {
  console.log(explainVerifiedIntervention(record, skillNames));
}

rule('ESCALATION — Meera / profit_loss');
const meeraPastProfitLoss = provider.getPastInterventions('stu_meera', 'profit_loss');
const escalationNote = explainEscalation(meeraPastProfitLoss, skillNames);
console.log(escalationNote ?? '(no prior failed interventions)');

rule();
console.log('Demo complete.\n');
