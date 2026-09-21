import { DemoAdapter } from '../integrations/demoAdapter';
import { generateForecast } from '../engines/forecastEngine';
import { explainForecast } from '../ai/explanationService';
import { buildExplanationInput } from '../ai/explanationInput';
import { Forecast } from '../types';

/**
 * SS63 Startupthon Demonstration - runs the exact before/after loop
 * described in the spec against the deterministic engines. Every
 * number below is COMPUTED by generateForecast(), not hardcoded -
 * only the underlying evidence (in DemoAdapter) is seeded, per SS66.
 *
 * Run: npm run demo
 */
async function main() {
  const adapter = new DemoAdapter();
  const studentId = 'demo_student';

  console.log('=== BEFORE: Feature 10 forecast on entry evidence ===');
  const beforeBundle = await adapter.buildEvidenceBundle(studentId);
  const beforeForecast = generateForecast(beforeBundle);
  beforeForecast.explanation = await explainForecast(buildExplanationInput(beforeForecast, beforeBundle.target?.targetScore ?? null));
  print(beforeForecast);

  console.log('\n=== Feature 7 -> Feature 5 -> Feature 8 -> Feature 9 loop runs (simulated) ===');
  adapter.advanceToAfterIntervention();

  console.log('\n=== AFTER: Feature 10 re-forecasts on new evidence ===');
  const afterBundle = await adapter.buildEvidenceBundle(studentId);
  const afterForecast = generateForecast(afterBundle);
  afterForecast.explanation = await explainForecast(buildExplanationInput(afterForecast, afterBundle.target?.targetScore ?? null));
  print(afterForecast);

  console.log('\n=== SUMMARY ===');
  console.log(`BEFORE readiness evidence: ${beforeBundle.readinessHistory[beforeBundle.readinessHistory.length - 1]?.value}%`);
  console.log(`AFTER  readiness evidence: ${afterBundle.readinessHistory[afterBundle.readinessHistory.length - 1]?.value}%`);
  console.log(`TARGET: ${afterBundle.target?.targetScore}%`);
  console.log(`Confidence moved: ${beforeForecast.confidence} -> ${afterForecast.confidence}`);
  console.log(`Target status moved: ${beforeForecast.targetStatus} -> ${afterForecast.targetStatus}`);
}

function print(forecast: Forecast) {
  console.log(`Status: ${forecast.status}`);
  console.log(`Predicted readiness: ${forecast.predictedValue}`);
  console.log(`Trajectory: ${forecast.trajectory} | Momentum: ${forecast.momentum} | Volatility: ${forecast.volatility}`);
  console.log(`Confidence: ${forecast.confidence} (${forecast.confidenceScore})`);
  console.log(`Target status: ${forecast.targetStatus} | Est. weeks to target: ${forecast.estimatedWeeksToTarget}`);
  console.log(`Primary bottleneck: ${forecast.bottlenecks.primary?.skill ?? 'none'}`);
  console.log(`Risks: ${forecast.risks.map((r) => `${r.type}(${r.severity})`).join(', ') || 'none'}`);
  console.log(`False mastery signals: ${forecast.falseMasterySignals.map((f) => f.skill).join(', ') || 'none'}`);
  console.log(`Explanation: ${forecast.explanation}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
