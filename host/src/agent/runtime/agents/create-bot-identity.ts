import { AgentBuilder, createLLMProvider } from 'poyraz';
import { isLocalProvider } from '../../../../../shared/types.ts';
import { toLibraryProfile } from '../../../domain/profiles.ts';
import { alignProfile, apiKeyForProfile, providerIsEnabled } from '../../../stores/provider-store.ts';
import { readSettings } from '../../../stores/settings-store.ts';
import { XECKBOT_CREATOR_PROMPT } from '../../catalog/prompts/xeckbot-creator.ts';

export class BotIdentityError extends Error {
  constructor(message: string, readonly status: 409 | 502) { super(message); }
}

/** A fresh agent with its own prompt and no tools or chat history. */
export async function createBotIdentity(name: string, purpose: string, signal?: AbortSignal): Promise<string> {
  const { defaultProfile } = await readSettings();
  if (!defaultProfile?.model.trim() || !(await providerIsEnabled(defaultProfile.provider))) {
    throw new BotIdentityError('XeckBot oluşturmak için ayarlardan etkin bir varsayılan model seç.', 409);
  }
  const profile = await alignProfile(defaultProfile);
  const apiKey = await apiKeyForProfile(profile);
  if (!isLocalProvider(profile.provider) && !apiKey.trim()) {
    throw new BotIdentityError('Varsayılan modelin sağlayıcısı için API anahtarı gerekli.', 409);
  }
  try {
    const libraryProfile = toLibraryProfile(profile);
    const agent = new AgentBuilder()
      .Name('XeckBot identity creator')
      .WithModelProfile(libraryProfile)
      .Provider(createLLMProvider(libraryProfile, apiKey))
      .ApiKey(apiKey)
      .SystemPrompt(XECKBOT_CREATOR_PROMPT)
      .Build();
    await agent.init();
    const timeout = AbortSignal.timeout(120_000);
    const result = await agent.chat(JSON.stringify({ name, purpose }), {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const prompt = result.content.trim();
    if (!prompt || prompt.length > 16_000) throw new Error('Invalid generated identity');
    return prompt;
  } catch {
    throw new BotIdentityError('XeckBot kimliği hazırlanamadı. Varsayılan modeli kontrol edip yeniden dene.', 502);
  }
}
