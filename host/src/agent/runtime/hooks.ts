import { runHooks, type HookEventName, type HookInput, type HookOutcome, type HookRegistry } from 'poyraz';

/** Shared by every host-built agent. Empty until a caller registers a hook. */
export const hostHooks: HookRegistry = {};

const PROMPT_BLOCKED = 'Prompt was blocked.';
const PERMISSION_DENIED = 'Permission denied.';
const SUBAGENT_BLOCKED = 'Subagent start was blocked.';

export function hooksRegistered(event: HookEventName): boolean {
  return (hostHooks[event]?.length ?? 0) > 0;
}

export function runHostHook(input: HookInput, signal?: AbortSignal): Promise<HookOutcome> {
  return runHooks(hostHooks, input, { signal });
}

export async function notifySessionStarted(sessionId: string, agentId?: string): Promise<void> {
  await runHostHook({ hook_event_name: 'SessionStart', session_id: sessionId, agent_id: agentId });
}

export async function notifySessionEnded(sessionId: string): Promise<void> {
  await runHostHook({ hook_event_name: 'SessionEnd', session_id: sessionId });
}

export async function submittedPrompt(sessionId: string, prompt: string, agentId?: string): Promise<string | undefined> {
  const decision = await runHostHook({
    hook_event_name: 'UserPromptSubmit',
    session_id: sessionId,
    agent_id: agentId,
    prompt,
  });
  if (!decision.blocked) return undefined;
  return decision.reason ?? PROMPT_BLOCKED;
}

export async function notifyInterrupted(sessionId: string, signal?: AbortSignal): Promise<void> {
  await runHostHook({ hook_event_name: 'Interrupt', session_id: sessionId }, signal);
}

/** `allow` skips the existing check. `deny` or `block` stops it. Anything else continues. */
export async function permissionDecision(
  sessionId: string | undefined,
  toolName?: string,
  signal?: AbortSignal,
): Promise<{ kind: 'allow' | 'deny' | 'continue'; reason?: string }> {
  if (!sessionId) return { kind: 'continue' };
  const decision = await runHostHook({
    hook_event_name: 'PermissionRequest',
    session_id: sessionId,
    tool_name: toolName,
  }, signal);
  if (decision.permissionDecision === 'allow' && !decision.blocked) return { kind: 'allow' };
  if (decision.blocked) return { kind: 'deny', reason: decision.reason ?? PERMISSION_DENIED };
  return { kind: 'continue' };
}

export async function subagentMayStart(parentId: string, agentId: string, task: string, signal?: AbortSignal): Promise<string | undefined> {
  const decision = await runHostHook({
    hook_event_name: 'SubagentStart',
    session_id: parentId,
    agent_id: agentId,
    prompt: task,
  }, signal);
  if (!decision.blocked) return undefined;
  return decision.reason ?? SUBAGENT_BLOCKED;
}

export async function notifySubagentStopped(sessionId: string, agentId: string, reason?: string): Promise<void> {
  await runHostHook({
    hook_event_name: 'SubagentStop',
    session_id: sessionId,
    agent_id: agentId,
    reason,
  });
}
