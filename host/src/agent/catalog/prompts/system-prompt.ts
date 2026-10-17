import { CORE_IDENTITY } from './builtin-instructions/core.ts';

export const AGENT_NAME = 'xeck';

export function buildXeckSystemInstructions(userInstructions: string, includeBuiltinInstructions: boolean): string {
  return [userInstructions.trim(), includeBuiltinInstructions ? CORE_IDENTITY.text.join('\n\n') : '']
    .filter(Boolean)
    .join('\n\n');
}
