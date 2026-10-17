import { z } from 'zod';




const BuiltinSelectionSchema = z.union([z.literal('*'), z.array(z.string())]);
export const AllowSelectorSchema = z.object({
  builtin: BuiltinSelectionSchema.optional(),
  mcp: z.union([z.literal('*'), z.array(z.string())]).optional(),
});
export type AllowSelector = z.infer<typeof AllowSelectorSchema>;


export const ToolsetSelectorSchema = z.object({
  builtin: BuiltinSelectionSchema,
  mcp: z.union([z.literal('*'), z.array(z.string())]),
  skills: z.boolean(),
});
export type ToolsetSelector = z.infer<typeof ToolsetSelectorSchema>;


export interface ToolLabelShape {
  name: string;
  requires?: string[];
  availableWhen?: string;
}

