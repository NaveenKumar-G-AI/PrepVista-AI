import { z } from "zod";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { TestIdeaProposal } from "./types";

const ProposalSchema = z.object({
  rationale: z.string().min(1),
  suggestedCategory: z.enum([
    "basic",
    "boundary",
    "edge",
    "adversarial",
    "large_input",
    "performance",
    "regression",
    "special_condition",
  ]),
  inputData: z.string().min(1),
});

/**
 * Problem-specific structural + bounds parsing. Different problems have
 * different input shapes, so this is pluggable — the pipeline stages
 * around it (schema, dedup, reference execution) are shape-agnostic.
 * This concrete implementation matches the seeded demo problem's format
 * ("n target\n a_1 ... a_n"); a real deployment would supply one per
 * problem (or a small library of common shapes).
 */
export interface InputFormatValidator {
  /** Throws with a human-readable reason on any structural or bounds violation. */
  validate(inputData: string, constraints: Record<string, any>): void;
}

export const pairSumFormatValidator: InputFormatValidator = {
  validate(inputData, constraints) {
    const lines = inputData.trimEnd().split("\n");
    if (lines.length < 2) throw new Error("expected 2 lines (header, then n integers)");
    const header = lines[0]!.trim().split(/\s+/);
    if (header.length !== 2) throw new Error("first line must be exactly 'n target'");
    const [nStr, targetStr] = header;
    const n = Number(nStr);
    const target = Number(targetStr);
    if (!Number.isInteger(n) || !Number.isInteger(target)) throw new Error("n and target must be integers");

    const rest = lines
      .slice(1)
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (n === 0) {
      if (rest.length !== 0) throw new Error(`n=0 but ${rest.length} values were provided`);
    } else if (rest.length !== n) {
      throw new Error(`declared n=${n} but ${rest.length} values were provided`);
    }

    const nBounds = constraints.n ?? { min: 0, max: Infinity };
    if (n < nBounds.min || n > nBounds.max) {
      throw new Error(`n=${n} is outside declared bounds [${nBounds.min}, ${nBounds.max}]`);
    }
    const vBounds = constraints.value ?? { min: -Infinity, max: Infinity };
    for (const tok of rest) {
      const v = Number(tok);
      if (!Number.isInteger(v)) throw new Error(`value token "${tok}" is not an integer`);
      if (v < vBounds.min || v > vBounds.max) {
        throw new Error(`value ${v} is outside declared bounds [${vBounds.min}, ${vBounds.max}]`);
      }
    }
    const tBounds = constraints.target ?? { min: -Infinity, max: Infinity };
    if (target < tBounds.min || target > tBounds.max) {
      throw new Error(`target=${target} is outside declared bounds [${tBounds.min}, ${tBounds.max}]`);
    }
  },
};

export interface ValidatedTestCase {
  status: "validated";
  category: TestIdeaProposal["suggestedCategory"];
  inputData: string;
  expectedOutput: string;
  purpose: string;
  source: "ai_generated";
  inputHash: string;
}

export interface RejectedProposal {
  status: "rejected";
  stage: "schema" | "structure_and_constraints" | "reference_execution" | "duplicate" | "quality";
  reason: string;
  proposal: unknown;
}

export type PipelineResult = ValidatedTestCase | RejectedProposal;

function normalizeForHash(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function hashInput(input: string): string {
  return createHash("sha256").update(normalizeForHash(input)).digest("hex");
}

/**
 * Runs the reference solution DIRECTLY (not through the candidate
 * sandbox) — this is trusted, server-authored code being used to derive
 * ground truth during test authoring, the same operation
 * scripts/seed-demo-problem.ts performs. It is still resource-bounded
 * (a buggy reference solution must not hang the pipeline), just not
 * subject to the full untrusted-code isolation stack.
 */
function runReferenceSolution(referenceSolutionPath: string, inputData: string): string {
  return execFileSync("python3", [referenceSolutionPath], {
    input: inputData,
    encoding: "utf8",
    timeout: 5000,
  });
}

export function validateProposals(
  rawProposals: unknown[],
  opts: {
    constraints: Record<string, any>;
    formatValidator: InputFormatValidator;
    referenceSolutionPath: string;
    existingInputHashes: Set<string>;
  }
): PipelineResult[] {
  const results: PipelineResult[] = [];
  const seenInThisBatch = new Set<string>();

  for (const raw of rawProposals) {
    // Stage 1: schema
    const parsed = ProposalSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ status: "rejected", stage: "schema", reason: parsed.error.message, proposal: raw });
      continue;
    }
    const proposal = parsed.data;

    // Stage 2: structural + constraint validation
    try {
      opts.formatValidator.validate(proposal.inputData, opts.constraints);
    } catch (err) {
      results.push({
        status: "rejected",
        stage: "structure_and_constraints",
        reason: (err as Error).message,
        proposal,
      });
      continue;
    }

    // Stage 3: duplicate detection (against both the existing active
    // suite AND other proposals in this same batch)
    const hash = hashInput(proposal.inputData);
    if (opts.existingInputHashes.has(hash) || seenInThisBatch.has(hash)) {
      results.push({
        status: "rejected",
        stage: "duplicate",
        reason: `input is a duplicate of an existing or already-accepted test (hash ${hash.slice(0, 12)})`,
        proposal,
      });
      continue;
    }

    // Stage 4: reference execution — this is what derives the expected
    // output. The AI's proposal is NEVER trusted for this value.
    let expectedOutput: string;
    try {
      expectedOutput = runReferenceSolution(opts.referenceSolutionPath, proposal.inputData);
    } catch (err) {
      results.push({
        status: "rejected",
        stage: "reference_execution",
        reason: `reference solution failed on this input: ${(err as Error).message}`,
        proposal,
      });
      continue;
    }

    // Stage 5: minimal quality gate — reject degenerate/empty output
    // that would trivially pass against almost anything.
    if (expectedOutput.trim().length === 0) {
      results.push({
        status: "rejected",
        stage: "quality",
        reason: "reference solution produced empty output for this input",
        proposal,
      });
      continue;
    }

    seenInThisBatch.add(hash);
    results.push({
      status: "validated",
      category: proposal.suggestedCategory,
      inputData: proposal.inputData,
      expectedOutput,
      purpose: `AI-proposed: ${proposal.rationale}`,
      source: "ai_generated",
      inputHash: hash,
    });
  }

  return results;
}
