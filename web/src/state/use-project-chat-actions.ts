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
  getSession,
  patchSession,
  renameProject as renameProjectRequest,
} from '../api/client.ts';
import { t } from '../i18n/index.ts';
import { writeLocation } from './location.ts';
import type { StreamingState } from './live-types.ts';
import { toSummary } from './session-summary.ts';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useProjectChatActions({
  activeId,
  sessionsRef,
  draftProjectIdRef,
  projectPageIdRef,
  settingsOpenRef,
  streamsRef,
  abortsRef,
  setSessions,
  setProjects,
  setActive,
  setDraftProjectId,
  setSidebarOpen,
  setError,
  showDraft,
  openChat,
  rememberSummary,
  clearTerminal,
}: {
  activeId: MutableRefObject<string | null>;
  sessionsRef: MutableRefObject<SessionSummary[]>;
  draftProjectIdRef: MutableRefObject<string | null>;
  projectPageIdRef: MutableRefObject<string | null>;
  settingsOpenRef: MutableRefObject<boolean>;
  streamsRef: MutableRefObject<Record<string, StreamingState>>;
  abortsRef: MutableRefObject<Map<string, AbortController>>;
  setSessions: StateSetter<SessionSummary[]>;
  setProjects: StateSetter<Project[]>;
  setActive: StateSetter<StoredSession | null>;
  setDraftProjectId: StateSetter<string | null>;
  setSidebarOpen: StateSetter<boolean>;
  setError: StateSetter<string | null>;
  showDraft: (projectId?: string | null) => void;
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
    }
  }, [rememberSummary, setError]);

  const updateBotProfile = useCallback(async (id: string, systemPrompt: string, badges: string[]) => {
    const session = await patchSession(id, { botSystemPrompt: systemPrompt, botBadges: badges });
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
      const remaining = sessionsRef.current.filter((item) => item.id !== id && !item.botConversation?.participants.includes(id));
      setSessions(remaining);
      if (activeId.current && !remaining.some((item) => item.id === activeId.current)) {
        if (remaining[0]) {
          const nextId = remaining[0].id;
          activeId.current = nextId;
          const next = await getSession(nextId);
          if (activeId.current !== nextId) return;
          setActive(next);
          if (!settingsOpenRef.current) writeLocation({ kind: 'chat', id: nextId }, 'push');
        } else {
          activeId.current = null;
          setActive(null);
          if (!settingsOpenRef.current) writeLocation({ kind: 'draft' }, 'push');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not delete the chat'));
    }
  }, [clearTerminal, streamsRef, abortsRef, sessionsRef, setSessions, activeId, setActive, settingsOpenRef, setError]);

  return {
    assignChatToProject,
    createBot,
    createChat,
    createProject,
    deleteChat,
    deleteProject,
    renameChat,
    renameProject,
    updateBotProfile,
  };
}
