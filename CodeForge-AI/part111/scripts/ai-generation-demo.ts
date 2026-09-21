import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool, closeAllPools } from "../lib/db/pool";
import { buildProviderChain, FallbackAIProvider } from "../lib/ai/provider-selector";
import { validateProposals, pairSumFormatValidator } from "../lib/ai/validation-pipeline";
import { createHash } from "node:crypto";

async function main() {
  const ids = JSON.parse(readFileSync(path.join(process.cwd(), ".demo-problem-ids.json"), "utf8"));
  const pool = getPool("service");

  const pv = (
    await pool.query(`select spec, constraints from public.problem_versions where id = $1`, [ids.problemVersionId])
  ).rows[0];

  const { rows: existing } = await pool.query(
    `select input_data, category from public.hidden_test_cases where test_suite_version_id = $1`,
    [ids.testSuiteVersionId]
  );
  const existingCategories = [...new Set(existing.map((r) => r.category))];
  const existingHashes = new Set(
    existing.map((r) => createHash("sha256").update(r.input_data.trim().replace(/\s+/g, " ")).digest("hex"))
  );

  console.log("=".repeat(70));
  console.log("AI-ASSISTED TEST GENERATION + VALIDATION PIPELINE");
  console.log(`No live GROQ_API_KEY/GEMINI_API_KEY configured -> using MockAIProvider`);
  console.log(`(the same interface real providers implement — see lib/ai/providers/)`);
  console.log("=".repeat(70));

  const usageLog: string[] = [];
  const chain = buildProviderChain(process.env);
  const ai = new FallbackAIProvider(chain, (e) =>
    usageLog.push(`  [usage] provider=${e.providerId} op=${e.operation} ok=${e.ok} ${e.durationMs}ms${e.errorMessage ? " err=" + e.errorMessage : ""}`)
  );

  const proposals = await ai.proposeTestIdeas({
    problemSpec: pv.spec.statement,
    constraints: pv.constraints,
    existingCategories,
    count: 5,
  });

  console.log(`\nProvider proposed ${proposals.length} candidate test ideas:`);
  proposals.forEach((p, i) => console.log(`  ${i + 1}. [${p.suggestedCategory}] ${p.rationale}`));
  console.log("\nUsage log:");
  usageLog.forEach((l) => console.log(l));

  console.log(`\nRunning validation pipeline (schema -> structure/constraints -> duplicate -> reference execution -> quality)...`);
  const results = validateProposals(proposals, {
    constraints: pv.constraints,
    formatValidator: pairSumFormatValidator,
    referenceSolutionPath: path.join(process.cwd(), "scripts", "demo-problem", "reference_solution.py"),
    existingInputHashes: existingHashes,
  });

  let accepted = 0;
  let rejected = 0;
  for (const [i, r] of results.entries()) {
    if (r.status === "validated") {
      accepted++;
      console.log(`\n  [${i + 1}] ACCEPTED -> category=${r.category}`);
      console.log(`       purpose: ${r.purpose}`);
      console.log(`       reference-computed expected_output: ${JSON.stringify(r.expectedOutput.trim())}`);
    } else {
      rejected++;
      console.log(`\n  [${i + 1}] REJECTED at stage="${r.stage}"`);
      console.log(`       reason: ${r.reason}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`RESULT: ${accepted} accepted (would move to admin review, NOT auto-published), ${rejected} rejected automatically`);
  console.log("Raw AI proposals were never published directly — every accepted case was independently re-derived from the reference solution.");
  console.log("=".repeat(70));

  await closeAllPools();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
