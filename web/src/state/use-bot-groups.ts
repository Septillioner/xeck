import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotGroup } from '../../../shared/bot-groups.ts';
import * as api from '../api/client.ts';

export function useBotGroups(enabled: boolean) {
  const revision = useRef(0);
  const [botGroups, setGroups] = useState<BotGroup[]>([]);
  const [botGroupsError, setError] = useState<string | null>(null);
  const [botGroupsLoading, setLoading] = useState(false);
  const refreshBotGroups = useCallback(async () => {
    const started = ++revision.current;
    setLoading(true); setError(null);
    try { const groups = await api.listBotGroups(); if (revision.current === started) setGroups(groups); }
    catch (cause) { if (revision.current === started) setError(cause instanceof Error ? cause.message : 'Request failed'); }
    finally { if (revision.current === started) setLoading(false); }
  }, []);
  useEffect(() => { if (enabled) void refreshBotGroups(); }, [enabled, refreshBotGroups]);
  const mutate = useCallback(async (action: () => Promise<BotGroup[]>) => {
    const started = ++revision.current;
    setLoading(true);
    try {
      const groups = await action();
      if (revision.current === started) { setGroups(groups); setError(null); }
    } finally { if (revision.current === started) setLoading(false); }
  }, []);
  const saveBotGroup = useCallback((id: string | null, name: string) => mutate(() => api.saveBotGroup(id, name)), [mutate]);
  const deleteBotGroup = useCallback((id: string) => mutate(() => api.deleteBotGroup(id)), [mutate]);
  const assignBotGroup = useCallback((botId: string, groupId: string | null) => mutate(() => api.assignBotGroup(botId, groupId)), [mutate]);
  return { botGroups, botGroupsError, botGroupsLoading, refreshBotGroups, saveBotGroup, deleteBotGroup, assignBotGroup };
}
