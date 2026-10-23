import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ApiError, getChangedFiles, getPlan, putPlanTodo } from '../api/client.ts';
import type { ChangedFile, PlanSnapshot, PlanStatus, PlanView } from '../../../shared/types.ts';
import { reportError, type ArtifactTab } from './context.ts';

type ActiveSessionRef = { current: string | null };

/** Owns plan snapshots, artifact-panel content, and per-chat dismissal state. */
export function useArtifactsState({
  activeId,
  setError,
}: {
  activeId: ActiveSessionRef;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const [plans, setPlans] = useState<Record<string, PlanSnapshot>>({});
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [planView, setPlanView] = useState<PlanView | null>(null);
  const [changedFileList, setChangedFileList] = useState<ChangedFile[]>([]);
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('plans');
  const [planPanelLoading, setPlanPanelLoading] = useState(false);
  const [planPanelDismissed, setPlanPanelDismissed] = useState<Record<string, true>>({});
  const planPanelDismissedRef = useRef(planPanelDismissed);
  planPanelDismissedRef.current = planPanelDismissed;

  const loadPlanPanel = useCallback(async (sessionId: string) => {
    setPlanPanelLoading(true);
    try {
      const [activePlan, files] = await Promise.all([getPlan(sessionId), getChangedFiles(sessionId)]);
      setChangedFileList(files);
      setPlanView(activePlan);
      setPlans((existing) => {
        const next = { ...existing };
        if (activePlan) next[sessionId] = activePlan;
        else delete next[sessionId];
        return next;
      });
    } catch (cause) {
      setPlanView(null);
      setError(reportError(cause));
    } finally {
      setPlanPanelLoading(false);
    }
  }, [setError]);

  const togglePlanTodo = useCallback(async (todoId: string, status: PlanStatus) => {
    const current = activeId.current;
    const snapshot = current ? plans[current] : null;
    if (!current || !snapshot) return;

    try {
      const next = await putPlanTodo(current, todoId, { status, revision: snapshot.revision });
      setPlans((existing) => ({ ...existing, [current]: next }));
    } catch (cause) {
      setError(reportError(cause));
      // A stale revision means the plan changed elsewhere; refresh it so the
      // next checkbox interaction does not repeat the same conflict.
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const view = await getPlan(current);
          if (activeId.current !== current) return;
          if (view) setPlans((existing) => ({ ...existing, [current]: view }));
          else setPlans((existing) => {
            const next = { ...existing };
            delete next[current];
            return next;
          });
        } catch {
          // The first error already explains why the click did not take effect.
        }
      }
    }
  }, [activeId, plans, setError]);

  const openPlanPanel = useCallback(async () => {
    const current = activeId.current;
    if (!current) return;
    setPlanPanelOpen(true);
    setPlanPanelDismissed((dismissed) => {
      const next = { ...dismissed };
      delete next[current];
      return next;
    });
    await loadPlanPanel(current);
  }, [activeId, loadPlanPanel]);

  const closePlanPanel = useCallback(() => {
    const current = activeId.current;
    setPlanPanelOpen(false);
    if (current) setPlanPanelDismissed((existing) => ({ ...existing, [current]: true }));
  }, [activeId]);

  return {
    artifactTab,
    changedFileList,
    closePlanPanel,
    loadPlanPanel,
    openPlanPanel,
    planPanelDismissedRef,
    planPanelLoading,
    planPanelOpen,
    planView,
    plans,
    setArtifactTab,
    setChangedFileList,
    setPlanPanelOpen,
    setPlanView,
    setPlans,
    togglePlanTodo,
  };
}
