import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ProviderKind } from '../../../shared/types.ts';

export const SUMMARY_THRESHOLD_RATIO = 0.8;

// The metadata file ships with the repository, one level above `host/`. This module
// runs from `src/domain/` in development and from `dist/` inside the Electron bundle,
// so every known layout is probed instead of trusting a single hard-coded depth.
const METADATA_CANDIDATES = ['../../../', '../../', '../'].map((prefix) =>
  fileURLToPath(new URL(`${prefix}model_prices_and_context_window.json`, import.meta.url)),
);

let openAiContextLengths: Promise<Map<string, number>> | undefined;

export async function staticContextLength(provider: ProviderKind, model: string): Promise<number | undefined> {
  if (provider !== 'openai') return undefined;
  openAiContextLengths ??= loadOpenAiContextLengths();
  const lengths = await openAiContextLengths;
  return lengths.get(model);
}

async function loadOpenAiContextLengths(): Promise<Map<string, number>> {
  const lengths = new Map<string, number>();
  const raw = await readModelMetadata();
  if (!raw) {
    console.warn(`Static OpenAI context lengths could not be loaded; looked in ${METADATA_CANDIDATES.join(', ')}`);
    return lengths;
  }
  const metadata: unknown = JSON.parse(raw);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return lengths;
  for (const [model, value] of Object.entries(metadata)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (row.litellm_provider !== 'openai' || row.mode !== 'chat') continue;
    const length = row.max_input_tokens;
    // max_tokens commonly describes the output limit, not the context window.
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length <= 0) continue;
    lengths.set(model, length);
  }
  return lengths;
}

async function readModelMetadata(): Promise<string | null> {
  for (const candidate of METADATA_CANDIDATES) {
    try {
      return await readFile(candidate, 'utf8');
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  return null;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}