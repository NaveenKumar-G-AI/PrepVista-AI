import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrCreateDemoStudentId } from "@/lib/auth/demoAuth";
import { createOnboardingContext } from "@/lib/db/repo";
import { apiError } from "@/lib/api/errors";

const ConfidenceEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);
const PainPointEnum = z.enum([
  "SPEED",
  "CARELESS_MISTAKES",
  "CONCEPTUAL_GAPS",
  "UNFAMILIAR_VARIATIONS",
  "TIME_PRESSURE",
  "CONSISTENCY",
]);

const InputSchema = z.object({
  preparationGoal: z.string().min(1).max(120),
  targetDate: z.string().nullable(),
  timelineCategory: z.enum(["URGENT", "MODERATE", "LONG_TERM", "UNSPECIFIED"]),
  daysAvailable: z.number().int().min(0).max(3650).nullable(),
  experienceLevel: z.enum(["FIRST_TIME", "RETAKING", "EXPERIENCED"]),
  previousPreparation: z.string().max(500).nullable(),
  confidenceQuantitative: ConfidenceEnum,
  confidenceLogical: ConfidenceEnum,
  confidenceVerbal: ConfidenceEnum,
  confidenceTimePressure: ConfidenceEnum,
  primaryPainPoint: PainPointEnum,
  secondaryPainPoints: z.array(PainPointEnum).max(5).default([]),
});

/**
 * This is the ONE endpoint in Feature 2 that stands in for Feature 1's
 * output. `src/app/onboarding-sim` is the clearly-labeled UI that posts
 * here. A real Feature 1 only needs to POST this same shape — everything
 * downstream (diagnostic start, selection, reporting) is unaffected.
 */
export async function POST(req: NextRequest) {
  try {
    const body = InputSchema.parse(await req.json());
    const studentId = await requireOrCreateDemoStudentId();

    const context = createOnboardingContext({ studentId, ...body });
    return NextResponse.json({ onboardingContextId: context.id });
  } catch (err) {
    return apiError(err);
  }
}
