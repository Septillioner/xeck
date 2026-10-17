import { z } from 'zod';
export const AgentDefSchema = z.object({
  id: z.string().min(1),
  startableBy: z.array(z.string()),
  instructions: z.array(z.string()),
  model: z.string().nullable().optional(),
  /** Vitrin metadatası: gövde koda dokunmaz, yalnızca isimle bağlanır. */
  label: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().optional(),
});
export type AgentDef = z.infer<typeof AgentDefSchema>;
