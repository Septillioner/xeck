import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveDataDir } from '../infra/data-dir.ts';
import { readJson, writeJson } from '../infra/json-file.ts';
import { createMutex } from '../infra/mutex.ts';
import { MAX_BOT_GROUP_NAME, type BotGroup } from '../../../shared/bot-groups.ts';

const exclusive = createMutex();
const file = () => path.join(resolveDataDir(), 'bot-groups.json');
async function readGroups(): Promise<BotGroup[]> {
  const groups = await readJson<BotGroup[]>(file(), []);
  return Array.isArray(groups) ? groups.filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string' && Array.isArray(group.botIds)) : [];
}
export const listBotGroups = () => exclusive(readGroups);
export function saveBotGroup(id: string | null, rawName: string) {
  return exclusive(async () => {
    const groups = await readGroups();
    const name = rawName.trim();
    if (!name || name.length > MAX_BOT_GROUP_NAME) throw new Error('Enter a group name (up to 80 characters)');
    if (groups.some((group) => group.id !== id && group.name.toLowerCase() === name.toLowerCase())) throw new Error('A group with this name already exists');
    const group = id ? groups.find((item) => item.id === id) : { id: randomUUID(), name, botIds: [] };
    if (!group) return null;
    group.name = name;
    if (!id) groups.push(group);
    await writeJson(file(), groups);
    return groups;
  });
}
export function deleteBotGroup(id: string) {
  return exclusive(async () => {
    const groups = (await readGroups()).filter((group) => group.id !== id);
    await writeJson(file(), groups);
    return groups;
  });
}
export function assignBotGroup(botId: string, groupId: string | null) {
  return exclusive(async () => {
    const groups = await readGroups();
    if (groupId !== null && !groups.some((group) => group.id === groupId)) return null;
    for (const group of groups) {
      group.botIds = group.botIds.filter((id) => id !== botId);
      if (group.id === groupId) group.botIds.push(botId);
    }
    await writeJson(file(), groups);
    return groups;
  });
}
