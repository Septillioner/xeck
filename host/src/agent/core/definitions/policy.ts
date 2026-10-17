import { z } from 'zod';
import type { HexColor } from '../../../../../shared/types.ts';
import { AllowSelectorSchema } from './toolset.ts';
const HEX_COLOR_PATTERN = /^#[\da-fA-F]{6}$/;
export const PolicyDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  accentColor: z.string().regex(HEX_COLOR_PATTERN).transform((value): HexColor => value as HexColor),
  allow: AllowSelectorSchema,
  deny: z.array(z.string()).optional(),
  maxToolRounds: z.number().int().min(1).nullable(),
  loop: z.string().optional(),
  choosable: z.array(z.string()),
  entryLine: z.string().optional(),
  /** Message returned when the model calls a tool this policy denies. */
  deniedReason: z.string().optional(),
});
export type PolicyDef = z.infer<typeof PolicyDefSchema>;
