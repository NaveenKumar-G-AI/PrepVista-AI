/**
 * Every AI call in the feature funnels through here. It guarantees three
 * things the rest of the system depends on:
 *
 *  1. Output is always validated against a zod schema before it is trusted.
 *  2. A malformed first attempt gets exactly one repair retry (same
 *     provider, told what was wrong) before we escalate.
 *  3. If nothing produces valid output, we return `{ ok: false }` — we
 *     never invent a plausible-looking result. Callers must treat `ok:
 *     false` as "insufficient evidence", per the Failure Modes principle.
 */
import type { ZodType } from "zod";
import type { ProviderChain } from "./provider.js";

export interface StructuredCallSuccess<T> {
  ok: true;
  data: T;
  provider: string;
  latencyMs: number;
  repaired: boolean;
}

export interface StructuredCallFailure {
  ok: false;
  reason: string;
}

export type StructuredCallOutcome<T> = StructuredCallSuccess<T> | StructuredCallFailure;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ?? trimmed;
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(stripCodeFences(text)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildRepairUserContent(originalUserContent: string, badOutput: string, problem: string): string {
  return `${originalUserContent}

---
Your previous response could not be used:
"""
${badOutput.slice(0, 1000)}
"""
Problem: ${problem}
Return ONLY a single valid JSON object matching the required schema. No markdown fences, no commentary.`;
}

/**
 * Minimal zod -> JSON-schema conversion covering the constructs this
 * feature's schemas actually use (object/string/number/boolean/array/enum/
 * optional). Kept in-house rather than pulling in a dependency, since we
 * only need "good enough for Gemini's responseSchema", not full fidelity.
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  switch (def?.typeName) {
    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const key of Object.keys(shape)) {
        const field = shape[key];
        properties[key] = zodToJsonSchema(field);
        if (field._def?.typeName !== "ZodOptional") required.push(key);
      }
      return { type: "object", properties, required };
    }
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType);
    default:
      return {};
  }
}

export async function structuredCall<T>(opts: {
  chain: ProviderChain;
  schema: ZodType<T>;
  systemPrompt: string;
  userContent: string;
  onProviderFailure?: (provider: string, error: unknown) => void;
}): Promise<StructuredCallOutcome<T>> {
  const jsonSchema = zodToJsonSchema(opts.schema);
  let userContent = opts.userContent;

  const MAX_ATTEMPTS = 2; // 1 initial attempt + 1 repair attempt
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await opts.chain.generate(
        { systemPrompt: opts.systemPrompt, userContent, jsonSchema },
        opts.onProviderFailure
      );
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }

    const parsed = safeJsonParse(result.rawText);
    if (!parsed.ok) {
      userContent = buildRepairUserContent(userContent, result.rawText, `Invalid JSON: ${parsed.error}`);
      continue;
    }

    const validated = opts.schema.safeParse(parsed.value);
    if (validated.success) {
      return { ok: true, data: validated.data, provider: result.provider, latencyMs: result.latencyMs, repaired: attempt > 0 };
    }
    userContent = buildRepairUserContent(userContent, result.rawText, validated.error.message);
  }

  return { ok: false, reason: "Model output failed schema validation after repair attempt." };
}
