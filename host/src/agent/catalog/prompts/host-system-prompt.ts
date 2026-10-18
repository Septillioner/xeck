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
export async function buildHostSystemPrompt(agentId?: string, bot?: { name: string; systemPrompt?: string }): Promise<string> {
  const settings = await readSettings();
  const agentDef = (agentId ? AGENT_BY_ID[agentId] : undefined) ?? CODER_AGENT;
  const customIdentity = bot?.systemPrompt?.trim();
  const instructions = customIdentity ? agentDef.instructions.filter((id) => !id.endsWith('.identity')) : agentDef.instructions;
  const identityText = buildAgentIdentityText(instructions, settings.xeckInstructionsEnabled);
  const base = customIdentity ? settings.systemInstructions.trim() : buildXeckSystemInstructions(settings.systemInstructions, settings.xeckInstructionsEnabled);
  return [base, identityText, customIdentity,
    customIdentity ? `Your current name is ${JSON.stringify(bot!.name)}. Use this name if it differs from an earlier name in your identity.` : '',
    'File scope: ' + JSON.stringify({ workspaceRoot: path.resolve(settings.workspaceRoot.trim() || process.cwd()), fullFileAccess: settings.fullFileAccess }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
