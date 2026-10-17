import { useEffect, type RefObject } from 'react';
import type { AgentPublic, PolicyChoice } from '../../../shared/types.ts';
import { isSessionPolicyId } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { hasOpenMenu } from '../ui/open-menu.ts';

/**
 * Draft policy for a session that does not exist yet: keep the picked id only
 * when the agent still exposes it, otherwise fall back to the workspace default.
 * Shared with `ModeSwitch` so the trigger label and the shortcut can never
 * disagree on what is currently selected.
 */
export function resolveDraftPolicyId(agentDef: AgentPublic, draftPolicyId: string): string {
  return agentDef.policies.some((policy) => policy.id === draftPolicyId)
    ? draftPolicyId
    : agentDef.defaultPolicy;
}

/** Next policy in catalog order, wrapping to the first. Unknown id starts at the first. */
export function nextPolicyChoice(policies: PolicyChoice[], currentId: string): PolicyChoice {
  const currentIndex = policies.findIndex((policy) => policy.id === currentId);
  return policies[(currentIndex + 1) % policies.length];
}

/**
 * Shift+Tab cycles the chat's policy while focus is on the chat surface (or
 * nowhere). The listener lives on `document` so it also fires from the
 * transcript and other non-focusable areas, but it declines every target
 * outside `surfaceRef` — sidebar renames and settings keep normal Shift+Tab
 * focus traversal.
 */
export function usePolicyCycle(surfaceRef: RefObject<HTMLElement | null>): void {
  const {
    active,
    agents,
    draftAgentId,
    draftPolicyId,
    policyId,
    policyBusy,
    setDraftPolicyId,
    setPolicyId,
    streaming,
  } = useAppState();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (active?.origin?.by === 'agent') return;
      if (event.key !== 'Tab' || !event.shiftKey) return;
      // defaultPrevented: another handler (e.g. the command menu) already used
      // the key. repeat: holding the chord down must not spin the policy.
      if (event.defaultPrevented || event.repeat) return;
      if (hasOpenMenu(document.body)) return;

      const target = event.target;
      const insideSurface =
        target instanceof Node && surfaceRef.current?.contains(target) === true;
      const unfocused = target === null || target === document.body;
      if (!insideSurface && !unfocused) return;

      const agentId = active?.agentId || draftAgentId;
      const agentDef = agents.find((agent) => agent.id === agentId);
      if (!agentDef || agentDef.policies.length < 2) return;
      if (streaming || policyBusy) return;

      const currentId = active
        ? policyId
        : resolveDraftPolicyId(agentDef, draftPolicyId);
      const next = nextPolicyChoice(agentDef.policies, currentId);
      event.preventDefault();
      if (active) void setPolicyId(next.id);
      else if (isSessionPolicyId(next.id)) setDraftPolicyId(next.id);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    surfaceRef,
    active,
    agents,
    draftAgentId,
    draftPolicyId,
    policyId,
    policyBusy,
    streaming,
    setDraftPolicyId,
    setPolicyId,
  ]);
}
