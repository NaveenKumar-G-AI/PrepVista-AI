/**
 * Implements the "FINAL QA SCENARIO" from the spec (section 99) verbatim:
 *   Target: Backend Engineer. Current: basic backend skills. Evidence: two
 *   projects. Opportunity: backend internship. Constraint: 10 hours/week.
 *   Decision: whether to spend the next month learning cloud vs internship
 *   prep.
 *
 * This is not a mock — it runs the real engines end-to-end
 * (buildCommandCenterView, recordDecision, action status transitions,
 * experiment lifecycle) against the in-memory store and prints what they
 * actually compute. Run with: npm run seed:qa
 */
import { InMemoryContextSourceRepository, InMemoryStrategyStore } from '../repositories/inMemoryRepository.js';
import { NullLLMProvider } from '../ai/llmProvider.js';
import { buildCommandCenterView } from '../services/strategyService.js';
import { recordDecision } from '../services/decisionService.js';
import { startExperiment, concludeExperiment } from '../engines/experimentEngine.js';

const STUDENT_ID = 'qa-student-1';

async function main() {
  const sources = new InMemoryContextSourceRepository();
  const store = new InMemoryStrategyStore();
  const llm = new NullLLMProvider(); // deterministic-only, matching "no ANTHROPIC_API_KEY configured"

  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();
  const daysFromNow = (n: number) => new Date(now + n * 86400000).toISOString();

  sources.seedStudent(STUDENT_ID, {
    goal: {
      id: 'goal-1',
      studentId: STUDENT_ID,
      targetRole: 'Backend Engineer',
      requiredSkills: ['backend', 'databases', 'apis', 'cloud', 'testing'],
      createdAt: daysAgo(60),
      active: true,
    },
    evidence: [
      { id: 'ev-1', type: 'project', title: 'Task Manager REST API', skillTags: ['backend', 'apis'], strength: 'moderate', createdAt: daysAgo(50) },
      { id: 'ev-2', type: 'project', title: 'Personal Blog Backend', skillTags: ['backend', 'databases'], strength: 'weak', createdAt: daysAgo(20) },
    ],
    opportunities: [
      { id: 'opp-1', title: 'Backend Engineering Internship — mid-size fintech', type: 'internship', relevanceToGoal: 0.85, deadline: daysFromNow(18), applied: false },
      { id: 'opp-2', title: 'Backend Intern — logistics startup', type: 'internship', relevanceToGoal: 0.6, deadline: daysFromNow(30), applied: false },
      { id: 'opp-3', title: 'Full-stack Intern — early-stage SaaS', type: 'internship', relevanceToGoal: 0.55, deadline: daysFromNow(25), applied: false },
      { id: 'opp-4', title: 'Data entry contract role', type: 'other', relevanceToGoal: 0.1, deadline: undefined, applied: true },
    ],
    applications: [{ id: 'app-1', opportunityId: 'opp-4', status: 'applied', appliedAt: daysAgo(15) }],
    constraints: [{ id: 'con-1', studentId: STUDENT_ID, type: 'time', description: '10 hours/week available alongside coursework', hoursPerWeek: 10 }],
    decisions: [],
    outcomes: [],
  });

  console.log('=== Feature 41 — QA Scenario (spec #99) ===\n');

  console.log('--- 1. Command Center (initial) ---');
  const view1 = await buildCommandCenterView(STUDENT_ID, sources, store, llm);
  console.log(JSON.stringify(view1, null, 2));

  console.log('\n--- 2. Recording the decision: "spend next month learning cloud vs internship prep" ---');
  const decisionResult = await recordDecision(
    {
      studentId: STUDENT_ID,
      question: 'Should I spend the next month learning cloud, or focus on internship preparation?',
      optionsConsidered: ['Learn cloud technologies', 'Focus on internship application + prep', 'Split time evenly'],
      chosenOption: 'Focus on internship application + prep, layering in cloud basics through the project work',
    },
    sources,
    store,
    (d) => sources.addDecision(STUDENT_ID, d),
  );
  console.log(JSON.stringify(decisionResult, null, 2));

  console.log('\n--- 3. Accepting the Next Best Move as an action, then completing it ---');
  const strategy = await store.getOrCreateStrategy(STUDENT_ID);
  if (view1.nextBestMove) {
    const action = await store.createAction({
      strategyId: strategy.id,
      kind: view1.nextBestMove.kind,
      title: view1.nextBestMove.title,
      valueTier: view1.nextBestMove.tier,
      reasoning: view1.nextBestMove.reasoning,
    });
    const accepted = await store.updateActionStatus(action.id, 'accepted');
    console.log('Action accepted:', JSON.stringify(accepted, null, 2));
  }

  console.log('\n--- 4. Running a career experiment end-to-end ---');
  let experiment = await store.createExperiment({
    strategyId: strategy.id,
    hypothesis: 'Adding a cloud-deployed version of an existing project increases interview responses.',
    action: 'Deploy the Task Manager REST API to a cloud provider and link it from applications.',
    expectedOutcome: 'At least one additional interview within 3 weeks of relevant applications.',
    measurement: 'Interview count on applications submitted after the deploy.',
    timeWindowDays: 21,
    status: 'planned',
  });
  experiment = await store.updateExperiment(experiment.id, startExperiment(experiment));
  console.log('Experiment started:', JSON.stringify(experiment, null, 2));
  const concluded = concludeExperiment(experiment, 'No interviews yet within the window.', 'inconclusive');
  experiment = await store.updateExperiment(experiment.id, concluded);
  console.log('Experiment concluded:', JSON.stringify(experiment, null, 2));

  console.log('\n--- 5. Command Center (after decision + accepted action + experiment) ---');
  const view2 = await buildCommandCenterView(STUDENT_ID, sources, store, llm);
  console.log(JSON.stringify(view2, null, 2));

  console.log('\n=== QA scenario complete ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
