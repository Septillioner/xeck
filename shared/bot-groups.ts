/** Organizational groups of people-like bots, independent from chat projects. */
export interface BotGroup { id: string; name: string; botIds: string[] }
export const MAX_BOT_GROUP_NAME = 80;
