import { z } from "zod";
import {
  CorrectnessStatus,
  ConfidenceLevel,
} from "./enums.js";

/**
 * Strict schema for the JSON we ask the AI provider to return.
 *
 * This is the ONLY shape of AI output the rest of the system will ever
 * consume. Anything that fails this validation is treated as a malformed
 * response (AIDegradationReason.MALFORMED_RESPONSE) and the system falls
 * back to the deterministic-only result. There is no "best effort" parsing
 * of near-miss JSON — see docs/EVIDENCE_HIERARCHY.md.
 */
export const AIFindingSchema = z
  .object({
    claim: z.string().min(1).max(400),
    evidenceIds: z.array(z.string().min(1)).max(20),
    confidence: z.nativeEnum(ConfidenceLevel),
  })
  .strict();

export const RootCauseSchema = z
  .object({
    layer: z.enum(["algorithm", "implementation", "specification-misunderstanding", "unknown"]),
    description: z.string().min(1).max(600),
    affectedRegions: z
      .array(
        z
          .object({
            file: z.string().max(300).optional(),
            startLine: z.number().int().nonnegative(),
            endLine: z.number().int().nonnegative(),
            startCol: z.number().int().nonnegative().optional(),
            endCol: z.number().int().nonnegative().optional(),
            snippet: z.string().max(500).optional(),
          })
          .strict()
      )
      .max(10),
  })
  .strict();

export const AIAnalysisResponseSchema = z
  .object({
    // The AI's own opinion. Recorded, NEVER authoritative — see AIAnalysisResult docs.
    statusAssessment: z.nativeEnum(CorrectnessStatus),
    explanationConfidence: z.nativeEnum(ConfidenceLevel),
    summary: z.string().min(1).max(600),
    findings: z.array(AIFindingSchema).max(12),
    requirementNotes: z
      .array(
        z
          .object({
            requirementId: z.string().min(1).max(100),
            note: z.string().min(1).max(400),
            evidenceIds: z.array(z.string().min(1)).max(20),
          })
          .strict()
      )
      .max(30),
    rootCause: RootCauseSchema.nullable(),
    recommendedNextAction: z.string().min(1).max(400),
  })
  .strict();

export type AIAnalysisResponseParsed = z.infer<typeof AIAnalysisResponseSchema>;

/**
 * The JSON Schema counterpart sent to providers (Groq response_format /
 * Gemini responseSchema). Kept structurally in sync with AIAnalysisResponseSchema
 * by test/ai/schemaSync.test.ts — if you add a field, update both.
 */
export const AI_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    statusAssessment: {
      type: "string",
      enum: Object.values(CorrectnessStatus),
    },
    explanationConfidence: { type: "string", enum: Object.values(ConfidenceLevel) },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: Object.values(ConfidenceLevel) },
        },
        required: ["claim", "evidenceIds", "confidence"],
      },
    },
    requirementNotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirementId: { type: "string" },
          note: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["requirementId", "note", "evidenceIds"],
      },
    },
    rootCause: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            layer: {
              type: "string",
              enum: ["algorithm", "implementation", "specification-misunderstanding", "unknown"],
            },
            description: { type: "string" },
            affectedRegions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  file: { type: "string" },
                  startLine: { type: "integer" },
                  endLine: { type: "integer" },
                  startCol: { type: "integer" },
                  endCol: { type: "integer" },
                  snippet: { type: "string" },
                },
                required: ["startLine", "endLine"],
              },
            },
          },
          required: ["layer", "description", "affectedRegions"],
        },
        { type: "null" },
      ],
    },
    recommendedNextAction: { type: "string" },
  },
  required: [
    "statusAssessment",
    "explanationConfidence",
    "summary",
    "findings",
    "requirementNotes",
    "rootCause",
    "recommendedNextAction",
  ],
} as const;
