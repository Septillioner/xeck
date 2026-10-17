import { z } from 'zod';

export const BuiltinInstructionDefSchema = z.object({
  id: z.string().min(1),
  text: z.array(z.string().min(1)).min(1),
});
export type BuiltinInstructionDef = z.infer<typeof BuiltinInstructionDefSchema>;


export function instruction(id: string, text: string[]): BuiltinInstructionDef {
  return BuiltinInstructionDefSchema.parse({ id, text });
}

  