import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  Project,
  SessionSummary,
  StoredSession,
  XeckBotCreateInput,
} from '../../../shared/types.ts';
import {
  cancelChat,
  createProject as createProjectRequest,
  createSession,
  deleteProject as deleteProjectRequest,
  deleteSession,
  patchSession,
  pinProject,
  renameProject as renameProjectRequest,
} from '../api/client.ts';
import { t } from '../i18n/index.ts';
import { writeLocation } from './location.ts';
import type { StreamingState } from './live-types.ts';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useProjectChatActions({
  removeDraft,
  activeId,
  sessionsRef,
  draftProjectIdRef,
  projectPageIdRef,
  streamsRef,
  abortsRef,
  setSessions,
  setProjects,
  setActive,
  setDraftProjectId,
  setSidebarOpen,
  setError,
  showDraft,
  showBots,
  openChat,
  rememberSummary,
  clearTerminal,
}: {
  removeDraft: (id: string) => void;
  activeId: MutableRefObject<string | null>;
  sessionsRef: MutableRefObject<SessionSummary[]>;
  draftProjectIdRef: MutableRefObject<string | null>;
  projectPageIdRef: MutableRefObject<string | null>;
  streamsRef: MutableRefObject<Record<string, StreamingState>>;
  abortsRef: MutableRefObject<Map<string, AbortController>>;
  setSessions: StateSetter<SessionSummary[]>;
  setProjects: StateSetter<Project[]>;
  setActive: StateSetter<StoredSession | null>;
  setDraftProjectId: StateSetter<string | null>;
  setSidebarOpen: StateSetter<boolean>;
  setError: StateSetter<string | null>;
  showDraft: (projectId?: string | null) => void;
  showBots: () => void;
  openChat: (id: string) => Promise<void>;
  rememberSummary: (session: StoredSession) => void;
  clearTerminal: (sessionId: string) => void;
}) {
  const createBot = useCallback(async (bot: XeckBotCreateInput) => {
    const session = await createSession({ bot });
    rememberSummary(session);
    await openChat(session.id);
  }, [rememberSummary, openChat]);

  const createProject = useCallback(async (name: string) => {
    const project = await createProjectRequest(name);
    setProjects((existing) => [...existing, project]);
    return project;
  }, [setProjects]);

  const renameProject = useCallback(async (id: string, name: string) => {
    const project = await renameProjectRequest(id, name);
    setProjects((existing) => existing.map((item) => item.id === project.id ? project : item));
    return project;
  }, [setProjects]);

  const setProjectPinned = useCallback(async (id: string, pinned: boolean) => {
    const project = await pinProject(id, pinned);
    setProjects((existing) => existing.map((item) => item.id === id ? project : item));
  }, [setProjects]);

  const deleteProject = useCallback(async (id: string) => {
    await deleteProjectRequest(id);
    const updatedAt = new Date().toISOString();
    setProjects((existing) => existing.filter((project) => project.id !== id));
    setSessions((existing) => existing.map((session) => session.projectId === id
      ? { ...session, projectId: undefined, updatedAt }
      : session));
    setActive((existing) => existing?.projectId === id
      ? { ...existing, projectId: undefined, updatedAt }
      : existing);
    if (draftProjectIdRef.current === id) setDraftProjectId(null);
    if (projectPageIdRef.current === id) {
      showDraft();
      writeLocation({ kind: 'draft' }, 'replace');
    }
  }, [showDraft, setProjects, setSessions, setActive, setDraftProjectId, draftProjectIdRef, projectPageIdRef]);

  const assignChatToProject = useCallback(async (sessionId: string, projectId: string | null) => {
    const session = await patchSession(sessionId, { projectId });
    rememberSummary(session);
  }, [rememberSummary]);

  const createChat = useCallback((projectId?: string) => {
    setSidebarOpen(false);
    writeLocation({ kind: 'draft' }, 'push');
    showDraft(projectId ?? null);
  }, [showDraft, setSidebarOpen]);

  const renameChat = useCallback(async (id: string, title: string) => {
    try {
      const session = await patchSession(id, { title });
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the chat'));
      throw cause;
    }
  }, [rememberSummary, setError]);

  const updateBotProfile = useCallback(async (id: string, systemPrompt: string, badges: string[], details?: { title: string; botColor: import('../../../shared/types.ts').BotColor; botPurpose?: string }) => {
    const session = await patchSession(id, { botSystemPrompt: systemPrompt, botBadges: badges, ...details });
    rememberSummary(session);
  }, [rememberSummary]);

  const updateChatOrganization = useCallback(async (id: string, patch: { pinned?: boolean; archived?: boolean }) => {
    const session = await patchSession(id, patch);
    rememberSummary(session);
  }, [rememberSummary]);

  const deleteChat = useCallback(async (id: string) => {
    try {
      if (streamsRef.current[id]) {
        abortsRef.current.get(id)?.abort();
        void cancelChat(id);
      }
      clearTerminal(id);
      await deleteSession(id);
      removeDraft(id);
      const remaining = sessionsRef.current.filter((item) => item.id !== id && !item.botConversation?.participants.includes(id));
      setSessions(remaining);
      if (activeId.current && !remaining.some((item) => item.id === activeId.current)) {
        const wasBot = sessionsRef.current.find((session) => session.id === id)?.bot;
        activeId.current = null;
        setActive(null);
        if (wasBot) showBots();
        else { showDraft(); writeLocation({ kind: 'draft' }, 'replace'); }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not delete the chat'));
      throw cause;
    }
  }, [clearTerminal, streamsRef, abortsRef, sessionsRef, setSessions, activeId, setActive, setError, removeDraft, showDraft, showBots]);

  return {
    assignChatToProject,
    createBot,
    createChat,
    createProject,
    deleteChat,
    deleteProject,
    renameChat,
    renameProject,
    setProjectPinned,
    updateBotProfile,
    updateChatOrganization,
  };
}
