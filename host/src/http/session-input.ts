import {
  BOT_COLORS,
  MAX_BOT_NAME_CHARS,
  MAX_BOT_PURPOSE_CHARS,
  MAX_BOT_SYSTEM_PROMPT_CHARS,
  MAX_XECKBOT_BADGES,
  MAX_XECKBOT_BADGE_LENGTH,
  isSessionPolicyId,
  type BotColor,
  type ModelProfile,
  type ReasoningEffort,
  type ServiceTier,
  type StoredSession,
} from '../../../shared/types.ts';
import { AGENT_BY_ID, XECKBOT_AGENT } from '../agent/catalog/agents.ts';
import { BotIdentityError, createBotIdentity } from '../agent/runtime/agents/create-bot-identity.ts';
import { agentWorkspaceRef, defaultAgentId } from '../agent/workspaces/resolve.ts';
import { WORKSPACE_BY_REF } from '../agent/catalog/workspaces.ts';
import { readProfileBody } from '../domain/profiles.ts';
import { alignProfile, providerIsEnabled } from '../stores/provider-store.ts';
import { getProject } from '../stores/projects.ts';
import { isSessionId, readSession, type SessionPatch } from '../stores/sessions.ts';
import { readSettings } from '../stores/settings-store.ts';
import { readBody, readEffort, readServiceTier } from './request.ts';

const BOT_NAME_ERROR = `Enter a name (up to ${MAX_BOT_NAME_CHARS} characters) and a valid color`;
const BOT_PURPOSE_ERROR = `XeckBot'un ne yapacağını yaz (en fazla ${MAX_BOT_PURPOSE_CHARS} karakter).`;
const BOT_PROJECT_ERROR = 'XeckBots cannot belong to a project';

export type SessionInputFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 502;
  error: string;
};

export type NewSessionInput = {
  ok: true;
  profile: ModelProfile | null;
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
  agentId?: string;
  policyId?: string;
  projectId?: string;
  bot?: { name: string; color: BotColor; purpose: string; systemPrompt: string };
};

type JsonRequest = {
  req: {
    json: () => Promise<unknown>;
    raw: { signal: AbortSignal };
  };
};

export async function readNewSession(request: JsonRequest): Promise<NewSessionInput | SessionInputFailure> {
  const body = await readBody(request);
  const profile = await resolveProfile(body);
  const reasoningEffort = readOptionalEffort(body);
  if (!reasoningEffort.ok) return reasoningEffort;
  const serviceTier = readOptionalTier(body);
  if (!serviceTier.ok) return serviceTier;
  const agentId = readAgentId(body);
  if (!agentId.ok) return agentId;
  const policyId = readPolicyId(body, agentId.value);
  if (!policyId.ok) return policyId;
  const projectId = await readProjectId(body);
  if (!projectId.ok) return projectId;
  const bot = await readCreatedBot(body, projectId.value, request.req.raw.signal);
  if (!bot.ok) return bot;
  return {
    ok: true,
    profile,
    reasoningEffort: reasoningEffort.value,
    serviceTier: serviceTier.value,
    agentId: agentId.value,
    policyId: policyId.value,
    projectId: projectId.value,
    bot: bot.value,
  };
}

export async function loadEditableSession(id: string): Promise<{ ok: true; session: StoredSession } | SessionInputFailure> {
  if (!isSessionId(id)) return failure(404, 'Session not found');
  const session = await readSession(id);
  if (!session) return failure(404, 'Session not found');
  if (session.botConversation) return failure(403, 'Bot conversations are managed by XeckBots');
  if (session.origin?.by === 'agent') return failure(403, 'Subagent sessions are read-only');
  return { ok: true, session };
}

export async function readSessionPatch(
  id: string,
  body: Record<string, unknown>,
  existing: StoredSession,
): Promise<{ ok: true; patch: SessionPatch } | SessionInputFailure> {
  const profile = await readPatchProfile(body);
  if (isFailure(profile)) return profile;
  const title = typeof body.title === 'string' ? body.title : undefined;
  const reasoningEffort = readPatchEffort(body);
  if (isFailure(reasoningEffort)) return reasoningEffort;
  const serviceTier = readPatchTier(body);
  if (isFailure(serviceTier)) return serviceTier;
  const projectId = await readPatchProject(id, body);
  if (isFailure(projectId)) return projectId;
  const botSystemPrompt = readBotInstruction(body, existing);
  if (isFailure(botSystemPrompt)) return botSystemPrompt;
  const botBadges = readBotBadges(body, existing);
  if (isFailure(botBadges)) return botBadges;
  const organization = readOrganization(body);
  if (isFailure(organization)) return organization;
  const botColor = readBotColor(body, existing);
  if (isFailure(botColor)) return botColor;
  const botPurpose = readBotPurpose(body, existing);
  if (isFailure(botPurpose)) return botPurpose;
  return {
    ok: true,
    patch: {
      title,
      profile,
      reasoningEffort,
      serviceTier,
      projectId,
      botSystemPrompt,
      botBadges,
      pinned: organization.pinned,
      archived: organization.archived,
      botColor,
      botPurpose,
    },
  };
}

function failure(status: SessionInputFailure['status'], error: string): SessionInputFailure {
  return { ok: false, status, error };
}

function isFailure(value: unknown): value is SessionInputFailure {
  return !!value && typeof value === 'object' && 'ok' in value && value.ok === false;
}

async function resolveProfile(body: Record<string, unknown> | null): Promise<ModelProfile | null> {
  const requested = body && 'profile' in body ? readProfileBody(body.profile) : null;
  const settings = await readSettings();
  let profile = requested?.model ? requested : settings.defaultProfile;
  if (profile && !(await providerIsEnabled(profile.provider))) profile = null;
  if (profile) profile = await alignProfile(profile);
  return profile;
}

function readOptionalEffort(body: Record<string, unknown> | null): { ok: true; value?: ReasoningEffort } | SessionInputFailure {
  const effort = body ? readEffort(body.reasoningEffort) : undefined;
  if (effort === false) return failure(400, 'Invalid reasoning effort');
  return { ok: true, value: effort || undefined };
}

function readOptionalTier(body: Record<string, unknown> | null): { ok: true; value?: ServiceTier } | SessionInputFailure {
  const tier = body ? readServiceTier(body.serviceTier) : undefined;
  if (tier === false) return failure(400, 'Invalid service tier');
  return { ok: true, value: tier || undefined };
}

function readAgentId(body: Record<string, unknown> | null): { ok: true; value?: string } | SessionInputFailure {
  const requested = body?.bot !== undefined
    ? XECKBOT_AGENT.id
    : typeof body?.agentId === 'string' ? body.agentId.trim() : '';
  if (requested && !AGENT_BY_ID[requested]) return failure(400, 'Unknown agent');
  const startedBy = body?.bot !== undefined ? 'bot' : 'user';
  if (requested && !AGENT_BY_ID[requested]?.startableBy.includes(startedBy)) {
    return failure(400, 'This agent can only be started by another agent');
  }
  return { ok: true, value: requested || undefined };
}

function readPolicyId(body: Record<string, unknown> | null, agentId?: string): { ok: true; value?: string } | SessionInputFailure {
  if (body?.policyId === undefined) return { ok: true };
  if (!isSessionPolicyId(body.policyId)) return failure(400, 'Invalid policy');
  const workspace = WORKSPACE_BY_REF[agentWorkspaceRef(agentId || defaultAgentId())];
  if (!workspace?.policies.includes(body.policyId)) return failure(400, 'Policy is not available for this agent');
  return { ok: true, value: body.policyId };
}

async function readProjectId(body: Record<string, unknown> | null): Promise<{ ok: true; value?: string } | SessionInputFailure> {
  if (body?.projectId === undefined) return { ok: true };
  if (typeof body.projectId !== 'string' || !(await getProject(body.projectId))) return failure(400, 'Unknown project');
  return { ok: true, value: body.projectId };
}

async function readCreatedBot(
  body: Record<string, unknown> | null,
  projectId: string | undefined,
  signal: AbortSignal,
): Promise<{ ok: true; value?: NewSessionInput['bot'] } | SessionInputFailure> {
  if (body?.bot === undefined) return { ok: true };
  const value = namedBot(body.bot);
  if (!value) return failure(400, BOT_NAME_ERROR);
  if (projectId) return failure(400, BOT_PROJECT_ERROR);
  if (typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.trim().length > MAX_BOT_PURPOSE_CHARS) {
    return failure(400, BOT_PURPOSE_ERROR);
  }
  try {
    const purpose = value.purpose.trim();
    const systemPrompt = await createBotIdentity(value.name, purpose, signal);
    return { ok: true, value: { name: value.name, color: value.color, purpose, systemPrompt } };
  } catch (error) {
    if (error instanceof BotIdentityError) return failure(error.status, error.message);
    throw error;
  }
}

function namedBot(value: unknown): { name: string; color: BotColor; purpose: unknown } | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as { name?: unknown; color?: unknown; purpose?: unknown };
  if (typeof draft.name !== 'string' || !draft.name.trim() || draft.name.trim().length > MAX_BOT_NAME_CHARS) return null;
  if (!BOT_COLORS.includes(draft.color as BotColor)) return null;
  return { name: draft.name.trim(), color: draft.color as BotColor, purpose: draft.purpose };
}

async function readPatchProfile(body: Record<string, unknown>): Promise<ModelProfile | undefined | SessionInputFailure> {
  if (!('profile' in body)) return undefined;
  const parsed = readProfileBody(body.profile);
  if (!parsed || !parsed.model) return failure(400, 'Invalid model');
  if (!(await providerIsEnabled(parsed.provider))) return failure(400, 'Provider is disabled');
  return alignProfile(parsed);
}

function readPatchEffort(body: Record<string, unknown>): ReasoningEffort | null | undefined | SessionInputFailure {
  if (!('reasoningEffort' in body)) return undefined;
  const effort = readEffort(body.reasoningEffort);
  if (effort === false) return failure(400, 'Invalid reasoning effort');
  return effort;
}

function readPatchTier(body: Record<string, unknown>): ServiceTier | null | undefined | SessionInputFailure {
  if (!('serviceTier' in body)) return undefined;
  const tier = readServiceTier(body.serviceTier);
  if (tier === false) return failure(400, 'Invalid service tier');
  return tier;
}

async function readPatchProject(
  id: string,
  body: Record<string, unknown>,
): Promise<string | null | undefined | SessionInputFailure> {
  if (!('projectId' in body)) return undefined;
  const existing = await readSession(id);
  if (existing?.bot && body.projectId !== null) return failure(400, BOT_PROJECT_ERROR);
  if (body.projectId === null) return null;
  if (typeof body.projectId !== 'string' || !(await getProject(body.projectId))) return failure(400, 'Unknown project');
  return body.projectId;
}

function readBotInstruction(body: Record<string, unknown>, existing: StoredSession): string | undefined | SessionInputFailure {
  if (!('botSystemPrompt' in body)) return undefined;
  if (!existing.bot) return failure(400, 'Only a XeckBot instruction can be edited here');
  if (typeof body.botSystemPrompt !== 'string' || !body.botSystemPrompt.trim() || body.botSystemPrompt.trim().length > MAX_BOT_SYSTEM_PROMPT_CHARS) {
    return failure(400, `Bot instruction must contain 1–${MAX_BOT_SYSTEM_PROMPT_CHARS} characters`);
  }
  return body.botSystemPrompt.trim();
}

function readBotBadges(body: Record<string, unknown>, existing: StoredSession): string[] | undefined | SessionInputFailure {
  if (!('botBadges' in body)) return undefined;
  if (!existing.bot) return failure(400, 'Only a XeckBot profile can have badges');
  if (!Array.isArray(body.botBadges) || body.botBadges.length > MAX_XECKBOT_BADGES || body.botBadges.some((badge) => typeof badge !== 'string' || !badge.trim() || badge.trim().length > MAX_XECKBOT_BADGE_LENGTH)) {
    return failure(400, `Use up to ${MAX_XECKBOT_BADGES} badges, each 1–${MAX_XECKBOT_BADGE_LENGTH} characters`);
  }
  return [...new Set((body.botBadges as string[]).map((badge) => badge.trim()))];
}

function readOrganization(body: Record<string, unknown>): { pinned?: boolean; archived?: boolean } | SessionInputFailure {
  for (const key of ['pinned', 'archived'] as const) {
    if (key in body && typeof body[key] !== 'boolean') return failure(400, 'Invalid organization flag');
  }
  return {
    pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
    archived: typeof body.archived === 'boolean' ? body.archived : undefined,
  };
}

function readBotColor(body: Record<string, unknown>, existing: StoredSession): BotColor | undefined | SessionInputFailure {
  if (!('botColor' in body)) return undefined;
  if (!existing.bot || !BOT_COLORS.includes(body.botColor as BotColor)) return failure(400, 'Invalid bot color');
  return body.botColor as BotColor;
}

function readBotPurpose(body: Record<string, unknown>, existing: StoredSession): string | undefined | SessionInputFailure {
  if (!('botPurpose' in body)) return undefined;
  if (!existing.bot || typeof body.botPurpose !== 'string' || !body.botPurpose.trim() || body.botPurpose.trim().length > MAX_BOT_PURPOSE_CHARS) {
    return failure(400, 'Invalid bot purpose');
  }
  return body.botPurpose.trim();
}
