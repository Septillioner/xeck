import {
  AgentBuilder,
  createLLMProvider,
  LOAD_SKILL_TOOL_NAME,
  LogLevel,
  type Agent,
  type ChatMessage,
  resolveContextWindow as resolveLibraryContextWindow,
} from 'poyraz';
import type { LibraryMessage, ModelProfile, ReasoningEffort, ServiceTier } from '../../../../../shared/types.ts';
import { effectiveContextLength } from '../../../../../shared/model-context.ts';
import { catalogSupportsReasoningEffort, listCatalog } from '../../../stores/catalog-store.ts';
import { buildHostSystemPrompt } from '../../catalog/prompts/host-system-prompt.ts';
import { AGENT_NAME } from '@@prompts/system-prompt.ts';
import { readRules, readSkills } from '../../../stores/instruction-store.ts';
import { refreshMcp } from '../../../stores/mcp-store.ts';
import { readSession } from '../../../stores/sessions.ts';
import { CONTINUE_OPEN_STEPS_HOOK } from '../../../plans/continuation.ts';
import { createOpenStepsContinuation, isLiveChatListening, readOpenStepsState, readPlanSummaryLine } from '../../../plans/open-steps-policy.ts';
import { HOST_SUMMARY_PREFIX, HOST_SUMMARY_PROMPT } from '../../../domain/summary.ts';
import { toLibraryProfile } from '../../../domain/profiles.ts';
import { staticContextLength, SUMMARY_THRESHOLD_RATIO } from '../../../domain/model-context.ts';
import { listProviders } from '../../../stores/provider-store.ts';
import { AGENT_BY_ID } from '../../catalog/agents.ts';
import { policyIdFor, selectedBuiltinNames } from '../../workspaces/definitions.ts';
import { LIST_MESSAGE_TARGETS_TOOL, SEND_CHAT_MESSAGE_TOOL } from '../../tools/builtin/messaging.ts';
import { filterToolsForPolicy } from '../../tools/policy-context.ts';
import { agentWorkspaceRef, chatIdentityFromSession } from '../../workspaces/resolve.ts';
import { CODING_WORKSPACE, WORKSPACE_BY_REF } from '../../catalog/workspaces.ts';
import { HOST_MCP_TOOL_PREFIX, isBuiltinHostTool, serverSideName } from '../../tools/builtin/identity.ts';
import { POLICY_BY_ID } from '../../catalog/policies.ts';
import { policyForId, maxToolRoundsForPolicy } from '../../workspaces/library-policy.ts';

/** All session kinds resolve the same workspace, instructions, policy and model setup. */
export interface AgentSetupInput {
  profile: ModelProfile;
  apiKey: string;
  libraryMessages: LibraryMessage[];
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
}

export interface SessionAgent {
  agent: Agent;
  configurationKey: string;
  continuedReplies: string[];
}

export async function prepareSessionAgent(sessionId: string, input: AgentSetupInput, includeTools: boolean) {
  const { profile, apiKey, libraryMessages } = input;
  const [rules, storedSession, effort, contextWindow] = await Promise.all([
    readRules(), readSession(sessionId),
    effortForProfile(profile, input.reasoningEffort), resolveContextWindowForProfile(profile),
  ]);
  const serviceTier = profile.provider === 'openai' ? input.serviceTier : undefined;
  const libraryProfile = toLibraryProfile(profile);
  const identity = chatIdentityFromSession(storedSession ?? {});
  const grant = storedSession?.origin?.by === 'agent' ? storedSession.origin.grant : null;
  const agentDef = AGENT_BY_ID[identity.agentId];
  if (!agentDef) throw new Error(`Unknown agent '${identity.agentId}'.`);
  const storedWorkspace = WORKSPACE_BY_REF[identity.workspace];
  const workspaceRef = storedWorkspace?.agents.includes(agentDef.id)
    ? identity.workspace
    : agentWorkspaceRef(agentDef.id);
  const workspaceDef = WORKSPACE_BY_REF[workspaceRef] ?? CODING_WORKSPACE;
  // Workspace toolset: `general` sohbet çekirdeğine düşer, dosya/terminal/plan
  // tool'ları hiç sunulmaz. Harici MCP'ler ve (toolset.skills ise) load_skill korunur.
  const toolset = new Set<string>(selectedBuiltinNames(workspaceDef.toolset.builtin));
  if (!storedSession?.bot || storedSession.botConversation) {
    toolset.delete(LIST_MESSAGE_TARGETS_TOOL);
    toolset.delete(SEND_CHAT_MESSAGE_TOOL);
  }
  const policyId = policyIdFor(workspaceRef, storedSession?.policyId ?? workspaceDef.defaultPolicy);
  const [skills, mcp, systemPrompt] = await Promise.all([
    includeTools ? readSkills() : [],
    includeTools ? refreshMcp() : { tools: {} },
    buildHostSystemPrompt(agentDef.id, storedSession?.bot ? { name: storedSession.botConversation?.responderTitle ?? storedSession.title, systemPrompt: storedSession.bot.systemPrompt } : undefined),
  ]);
  const availableTools = includeTools
    ? [
        ...(skills.length > 0 && workspaceDef.toolset.skills ? [LOAD_SKILL_TOOL_NAME] : []),
        ...Object.keys(mcp.tools).filter((name) => !isBuiltinHostTool(name) || toolset.has(serverSideName(name))),
      ]
    : [];
  const allowedTools = grant
    ? availableTools.filter((name) => grant.tools.includes(name))
    : availableTools;
  const policy = policyForId(policyId, allowedTools);
  // A child grant must retain exact names instead of broad MCP server patterns.
  if (grant) policy.allowedTools = filterToolsForPolicy(allowedTools, policyId);
  const maxRounds = maxToolRoundsForPolicy(policyId);
  // Model, workspace, policy, instructions and tools define the pooled instance.
  // Effort, service tier, context window and round budget are updated between turns.
  const configurationKey = `${configurationKeyOf(profile, apiKey)}\n${includeTools ? 'tools' : 'no-tools'}\n${workspaceRef}\n${agentDef.id}:${policyId}\n${JSON.stringify({ systemPrompt, rules, skills, allowedTools })}`;
  const create = async (): Promise<SessionAgent> => {
    const continuedReplies: string[] = [];
    let builder = new AgentBuilder()
      .Name(storedSession?.bot ? storedSession.botConversation?.responderTitle ?? storedSession.title : AGENT_NAME)
      .WithModelProfile(libraryProfile)
      .Provider(createLLMProvider(libraryProfile, apiKey))
      .ApiKey(apiKey)
      // The prefix keeps the Turkish wording of earlier versions, otherwise stored
      // summaries are no longer recognized (see domain/summary.ts).
      .Summarization({
        enabled: true,
        thresholdRatio: SUMMARY_THRESHOLD_RATIO,
        prefix: HOST_SUMMARY_PREFIX,
        prompt: HOST_SUMMARY_PROMPT,
        // The plan survives the history it replaced as one line at the end of the summary
        // message, so the model reads it right after the summary, also mid-turn.
        onSummarized: ({ sessionId: summarizedSession }) =>
          summarizedSession ? readPlanSummaryLine(summarizedSession) : null,
      })
      .MaxToolRounds(maxRounds)
      // The host connects MCP itself and merges the tools below, so only the prefix is
      // given: it decides which tool schemas the meter files under `mcp`.
      .Mcp({ toolPrefix: HOST_MCP_TOOL_PREFIX })
      .Logging({ level: LogLevel.WARN, chatDebugLog: true, source: 'http' });
    if (POLICY_BY_ID[policyId]?.loop === CONTINUE_OPEN_STEPS_HOOK) {
      builder = builder.Continuation(
        createOpenStepsContinuation({
          readState: readOpenStepsState,
          isListening: isLiveChatListening,
          onContinue: (_sessionKey, reply) => continuedReplies.push(reply),
        }),
      );
    }
    if (contextWindow) builder = builder.ContextWindow(contextWindow);
    if (systemPrompt) builder = builder.SystemPrompt(systemPrompt);
    if (effort) builder = builder.Reasoning({ effort });
    if (serviceTier) builder = builder.ServiceTier(serviceTier);
    if (rules.length > 0) builder = builder.Rules(...rules);
    if (skills.length > 0) builder = builder.AddSkills(skills);
    const agent = builder
      .Policy(policy)
      .Build();
    if (Object.keys(mcp.tools).length > 0) {
      const replaced = agent.mergeExternalTools(mcp.tools);
      if (replaced.length > 0) {
        console.warn(`MCP tool names replaced an existing tool of session ${sessionId}: ${replaced.join(', ')}`);
      }
    }
    agent.setSessionId(sessionId);
    await agent.init();
    agent.loadHistory(libraryMessages as ChatMessage[]);
    return { agent, configurationKey, continuedReplies } satisfies SessionAgent;
  };
  const update = (entry: SessionAgent) => {
    entry.agent.setModelProfile(libraryProfile, apiKey);
    entry.agent.setReasoning(effort ? { effort } : undefined);
    entry.agent.setServiceTier(serviceTier);
    entry.agent.setContextWindow(contextWindow);
    entry.agent.setMaxToolRounds(maxRounds);
    entry.agent.loadHistory(libraryMessages as ChatMessage[]);
    entry.continuedReplies.length = 0;
  };
  return { configurationKey, create, update };
}

async function effortForProfile(profile: ModelProfile, effort?: ReasoningEffort): Promise<ReasoningEffort | undefined> {
  if (!effort) return undefined;
  if (!(await catalogSupportsReasoningEffort(profile.provider, profile.model))) return undefined;
  return effort;
}

/** Same source the ContextMeter reads, so the trigger matches the ring. */
async function resolveContextWindowForProfile(profile: ModelProfile): Promise<number | undefined> {
  const [catalog, providers] = await Promise.all([listCatalog(), listProviders()]);
  const catalogEntry = catalog.find(
    (entry) => entry.provider === profile.provider && entry.model === profile.model,
  );
  const catalogLength = catalogEntry
    ? effectiveContextLength(profile.model, catalogEntry.contextLength, catalogEntry.maxContextEnabled)
    : undefined;
  const providerLengths = providers.find((item) => item.kind === profile.provider)?.contextLengths;
  // Catalog override first, then the provider's own lengths, then the static table. The
  // library owns the order and the validity check (a whole number of at least 1000).
  const resolved = await resolveLibraryContextWindow({
    model: profile.model,
    host: profile.host,
    provider: profile.provider,
    catalog: () => catalogLength,
    providerCache: providerLengths ?? {},
    staticTable: ({ model }) => staticContextLength(profile.provider, model),
  });
  if (!resolved) {
    console.warn(`Context window unknown for ${profile.provider}/${profile.model}; token-based autosummary disabled.`);
  }
  return resolved?.tokens;
}

function configurationKeyOf(profile: ModelProfile, apiKey: string): string {
  return `${profile.provider}\n${profile.host}\n${profile.model}\n${apiKey}`;
}
