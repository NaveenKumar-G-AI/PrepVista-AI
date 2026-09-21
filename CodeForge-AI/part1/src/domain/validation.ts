import { z } from 'zod';

// Slugs are the stable external identifier (Step 5: "Display names must
// never be the database identity") — API consumers never see raw DB ids.
const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase, hyphenated slug');

export const careerContextUpdateSchema = z
  .object({
    primaryRoleSlug: slugSchema,
    secondaryRoleSlug: slugSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => body.secondaryRoleSlug !== body.primaryRoleSlug, {
    message: 'primaryRoleSlug and secondaryRoleSlug must differ',
    path: ['secondaryRoleSlug'],
  });

export type CareerContextUpdateInput = z.infer<typeof careerContextUpdateSchema>;
