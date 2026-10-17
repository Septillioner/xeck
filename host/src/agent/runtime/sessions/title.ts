import { createLLMProvider } from 'poyraz';
import { isLocalProvider, type ModelProfile } from '../../../../../shared/types.ts';
import { toLibraryProfile } from '../../../domain/profiles.ts';
import { alignProfile, apiKeyForProfile, providerIsEnabled } from '../../../stores/provider-store.ts';
import { readSettings } from '../../../stores/settings-store.ts';
import { setSessionTitle } from '../../../stores/sessions.ts';

/** Only the head of a first message is sent; the title request must stay small. */
const TITLE_INPUT_MAX_CHARS = 2000;

const TITLE_INSTRUCTIONS = [
  'Write a short title for a chat that starts with the user message below.',
  'At most 6 words, in the same language as the message.',
  'No quotes, no trailing punctuation, no "Title:" prefix.',
  'Answer with the title only.',
].join('\n');

/** The whole request body: fixed rules first, then the bounded message. */
function titlePrompt(question: string): string {
  return `${TITLE_INSTRUCTIONS}\n\n${question.slice(0, TITLE_INPUT_MAX_CHARS)}`;
}

/** Keeps the first non-empty line and drops the label, quotes and markup a model adds. */
function cleanTitle(raw: string): string | null {
  const firstLine = raw
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;
  const withoutLabel = firstLine.replace(/^(?:title|başlık)\s*[:：-]\s*/i, '');
  const withoutMarkup = withoutLabel.replace(/^["'`*#\s]+/, '').replace(/["'`*#\s]+$/, '');
  const singleLine = withoutMarkup.replace(/\s+/g, ' ').trim();
  return singleLine || null;
}

/** The configured autocomplete model, ready to send; null when it cannot be used. */
async function titleTarget(): Promise<{ profile: ModelProfile; apiKey: string } | null> {
  const { autocompleteProfile } = await readSettings();
  if (!autocompleteProfile) return null;
  const profile = await alignProfile(autocompleteProfile);
  if (!(await providerIsEnabled(profile.provider))) return null;
  const apiKey = await apiKeyForProfile(profile);
  if (!isLocalProvider(profile.provider) && !apiKey.trim()) return null;
  return { profile, apiKey };
}

/**
 * One standalone request on the autocomplete model. Null means the setting is
 * empty, the provider is unusable, or the request failed: the title is cosmetic,
 * so a failure is swallowed and the stored title stays as it is.
 */
async function generateChatTitle(question: string): Promise<string | null> {
  try {
    const target = await titleTarget();
    if (!target) return null;
    const provider = createLLMProvider(toLibraryProfile(target.profile), target.apiKey);
    const response = await provider.chat({
      model: target.profile.model,
      messages: [{ role: 'user', content: titlePrompt(question) }],
    });
    return cleanTitle(response.content);
  } catch {
    return null;
  }
}

/**
 * Names a chat from its first message without holding the turn: the request runs
 * beside `POST /messages`, the stored title is written when it lands, and the
 * caller is told so it can push the new title to a live stream.
 */
export function startChatTitle(input: {
  sessionId: string;
  question: string;
  onTitle: (title: string) => void;
}): void {
  void (async () => {
    const title = await generateChatTitle(input.question);
    if (!title) return;
    await setSessionTitle(input.sessionId, title);
    input.onTitle(title);
  })().catch(() => undefined);
}
