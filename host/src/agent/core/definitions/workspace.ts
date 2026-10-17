import { z } from 'zod';
import { ToolsetSelectorSchema} from './toolset.ts';


export const WorkspaceDefSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  label: z.string(),
  defaultAgent: z.string().min(1),
  agents: z.array(z.string()),
  policies: z.array(z.string()),
  defaultPolicy: z.string().min(1),
  toolset: ToolsetSelectorSchema,
});
export type WorkspaceDef = z.infer<typeof WorkspaceDefSchema>;
export interface NameScope {
  serverSideName: string;
  isBuiltin: boolean;
  isSkillTool: boolean;
}
