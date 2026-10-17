import type { ProviderKind } from '../../../shared/types.ts';

export const REMOTE_PROVIDER_SLUGS = ['openai', 'groq', 'gemini', 'openrouter'] as const;
export type RemoteProviderSlug = (typeof REMOTE_PROVIDER_SLUGS)[number];

export function isRemoteProviderSlug(kind: ProviderKind): kind is RemoteProviderSlug {
  return (REMOTE_PROVIDER_SLUGS as readonly string[]).includes(kind);
}

export const DEFAULT_CATALOG_MODELS: Record<RemoteProviderSlug, readonly string[]> = {
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'qwen/qwen3-32b', 'gemma2-9b-it'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  openrouter: [
    'openai/gpt-4.1',
    'anthropic/claude-sonnet-4',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
  ],
};
