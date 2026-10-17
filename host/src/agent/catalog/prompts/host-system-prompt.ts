import path from 'node:path';
import { buildXeckSystemInstructions } from '@@prompts/system-prompt.ts';
import { buildAgentIdentityText } from '@@prompts/builtin-instructions/index.ts';
import { AGENT_BY_ID, CODER_AGENT } from '../agents.ts';
import { readSettings } from '../../../stores/settings-store.ts';

/**
 * The system text the host hands to `SystemPrompt(...)`: settings instructions plus
 * the agent identity. Its content is host-specific, so it stays here while the
 * library measures whatever this returns.
 */
export async function buildHostSystemPrompt(agentId?: string): Promise<string> {
  const settings = await readSettings();
  const agentDef = (agentId ? AGENT_BY_ID[agentId] : undefined) ?? CODER_AGENT;
  const identityText = buildAgentIdentityText(agentDef.instructions, settings.xeckInstructionsEnabled);
  return [buildXeckSystemInstructions(settings.systemInstructions, settings.xeckInstructionsEnabled), identityText,
    'File scope: ' + JSON.stringify({ workspaceRoot: path.resolve(settings.workspaceRoot.trim() || process.cwd()), fullFileAccess: settings.fullFileAccess }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
