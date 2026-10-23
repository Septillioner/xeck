import { useCallback, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type {
  ModelProfile,
  ProviderKind,
  ReasoningEffort,
  ServiceTier,
  SessionSummary,
  StoredSession,
} from '../../../shared/types.ts';
import { patchSession } from '../api/client.ts';
import { t } from '../i18n/index.ts';
import { toSummary } from './session-summary.ts';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useSessionPreferences({
  active,
  activeId,
  setDraftProfile,
  setDraftEffort,
  setDraftServiceTier,
  setSessions,
  setError,
  rememberSummary,
}: {
  active: StoredSession | null;
  activeId: MutableRefObject<string | null>;
  setDraftProfile: StateSetter<ModelProfile | null>;
  setDraftEffort: StateSetter<ReasoningEffort | null>;
  setDraftServiceTier: StateSetter<ServiceTier | null>;
  setSessions: StateSetter<SessionSummary[]>;
  setError: StateSetter<string | null>;
  rememberSummary: (session: StoredSession) => void;
}) {
  const setSessionModel = useCallback(async (provider: ProviderKind, model: string) => {
    if (!active) {
      setDraftProfile({ provider, model, host: '' });
      return;
    }
    try {
      const session = await patchSession(active.id, { profile: { provider, model } });
      if (activeId.current !== session.id) {
        setSessions((current) =>
          [toSummary(session), ...current.filter((item) => item.id !== session.id)].sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt),
          ),
        );
        return;
      }
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not change the model'));
    }
  }, [active, activeId, setDraftProfile, setSessions, rememberSummary, setError]);

  const setSessionEffort = useCallback(async (effort: ReasoningEffort | null) => {
    if (!active) {
      setDraftEffort(effort);
      return;
    }
    try {
      const session = await patchSession(active.id, { reasoningEffort: effort });
      if (activeId.current !== session.id) return;
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not change reasoning effort'));
    }
  }, [active, activeId, setDraftEffort, rememberSummary, setError]);

  const setSessionServiceTier = useCallback(async (tier: ServiceTier | null) => {
    if (!active) {
      setDraftServiceTier(tier);
      return;
    }
    try {
      const session = await patchSession(active.id, { serviceTier: tier });
      if (activeId.current !== session.id) return;
      rememberSummary(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not change service tier'));
    }
  }, [active, activeId, setDraftServiceTier, rememberSummary, setError]);

  return { setSessionEffort, setSessionModel, setSessionServiceTier };
}
