import {
  DEFAULT_GEMINI_API_BASE,
  DEFAULT_GROQ_HOST,
  DEFAULT_LLAMACPP_HOST,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OPENAI_HOST,
  DEFAULT_OPENROUTER_HOST,
  geminiProfile,
  groqProfile,
  llamaCppProfile,
  ollamaProfile,
  openAiProfile,
  openRouterProfile,
  type ModelProfile as LibraryProfile,
} from 'poyraz';
import type { ModelProfile, ProviderKind } from '../../../shared/types.ts';
import { isProviderKind } from '../../../shared/types.ts';

export function defaultHost(kind: ProviderKind): string {
  if (kind === 'ollama') return DEFAULT_OLLAMA_HOST;
  if (kind === 'llamacpp') return DEFAULT_LLAMACPP_HOST;
  if (kind === 'openai') return DEFAULT_OPENAI_HOST;
  if (kind === 'groq') return DEFAULT_GROQ_HOST;
  if (kind === 'gemini') return DEFAULT_GEMINI_API_BASE;
  return DEFAULT_OPENROUTER_HOST;
}

export function emptyProfile(): ModelProfile {
  return { provider: 'openai', model: '', host: DEFAULT_OPENAI_HOST };
}

export function canonicalizeProfile(profile: ModelProfile, localHost?: string): ModelProfile {
  return toSharedProfile(profile.provider, profile.model, localHost ?? profile.host);
}

export function toLibraryProfile(profile: ModelProfile): LibraryProfile {
  return buildLibraryProfile(profile.provider, profile.model, profile.host);
}

export function toSharedProfile(kind: ProviderKind, model: string, localHost?: string): ModelProfile {
  const library = buildLibraryProfile(kind, model, localHost);
  return { provider: kind, model: library.model, host: library.host };
}

export function readProfileBody(value: unknown): ModelProfile | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { provider?: unknown; model?: unknown };
  if (typeof body.provider !== 'string' || !isProviderKind(body.provider)) return null;
  if (typeof body.model !== 'string') return null;
  return toSharedProfile(body.provider, body.model.trim());
}

function buildLibraryProfile(kind: ProviderKind, model: string, localHost?: string): LibraryProfile {
  if (kind === 'ollama') return ollamaProfile(model, localHost || DEFAULT_OLLAMA_HOST);
  if (kind === 'llamacpp') return llamaCppProfile(model, localHost || DEFAULT_LLAMACPP_HOST);
  if (kind === 'openai') return openAiProfile(model);
  if (kind === 'groq') return groqProfile(model);
  if (kind === 'gemini') return geminiProfile(model);
  return openRouterProfile(model);
}
