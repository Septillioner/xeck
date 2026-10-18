import { t } from '../i18n/index.ts';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { ChangedFile } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconClose, IconPlay } from '../ui/icons.tsx';
import { diffLineClass, highlightedDiffLine, languageForPath } from './messages/diff-highlight.ts';
import { Markdown } from './Markdown.tsx';
import { PlanMeter } from './PlanMeter.tsx';
import { PlanTodoList } from './PlanTodoList.tsx';

const PANE_DEFAULT_WIDTH = 460;
const PANE_MIN_WIDTH = 320;
const PANE_CHAT_MIN_WIDTH = 320;
const PANE_COLLAPSED_WIDTH = 36;

let rememberedWidth = PANE_DEFAULT_WIDTH;

type PlanTab = 'preview' | 'source';

/**
 * The active plan and changed files for the open chat. The plan is rendered by
 * default, with its Markdown source available on demand; Build starts implementation.
 */
export function PlanPanel() {
  const {
    planView,
    changedFiles,
    artifactTab,
    setArtifactTab,
    planPanelOpen,
    planPanelLoading,
    planSurface,
    offerBuild,
    policyBusy,
    streaming,
    closePlanPanel,
    openPlanPanel,
    buildPlan,
  } = useAppState();
  const [tab, setTab] = useState<PlanTab>('preview');
  const [width, setWidth] = useState(rememberedWidth);
  const [dragging, setDragging] = useState(false);
  const paneRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function clampToColumn() {
      const columnWidth = paneRef.current?.parentElement?.clientWidth;
      if (!columnWidth) return;
      setWidth((current) => {
        const next = clampPaneWidth(current, columnWidth);
        rememberedWidth = next;
        return next;
      });
    }
    window.addEventListener('resize', clampToColumn);
    return () => window.removeEventListener('resize', clampToColumn);
  }, []);

  function onResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const columnWidth = paneRef.current?.parentElement?.clientWidth ?? drag.startWidth + PANE_CHAT_MIN_WIDTH;
    const next = clampPaneWidth(drag.startWidth + (drag.startX - event.clientX), columnWidth);
    rememberedWidth = next;
    setWidth(next);
  }

  function onResizePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // Escape closes the pane, the same as the debug pane next to it.
  useEffect(() => {
    if (!planPanelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePlanPanel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [planPanelOpen, closePlanPanel]);

  const planVisible = planSurface && Boolean(planView);
  // Changes stay with the pane. The plan tab is the plan tool surface.
  if (!planVisible && changedFiles.length === 0 && !planPanelLoading) return null;

  if (!planPanelOpen) {
    return (
      <aside
        ref={paneRef}
        className="plan-pane"
        data-open="false"
        style={{ '--pane-width': `${PANE_COLLAPSED_WIDTH}px` } as CSSProperties}
        aria-label={t("Artifacts")}
      >
        <button type="button" className="plan-reopen" onClick={() => void openPlanPanel()}>
          {t("Artifacts")}</button>
      </aside>
    );
  }

  return (
    <aside
      ref={paneRef}
      className="plan-pane"
      data-open="true"
      style={{ '--pane-width': `${width}px` } as CSSProperties}
      aria-label={t("Artifacts")}
    >
      <button
        type="button"
        className="plan-resize"
        aria-label={t("Resize artifacts pane")}
        data-active={dragging ? 'true' : 'false'}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
      />
      <div className="plan-pane-head">
        <h2>{t("Artifacts")}</h2>
        <div className="plan-tabs" role="group" aria-label={t("Artifact view")}>
          {planSurface ? (
            <button
              type="button"
              className="plan-tab"
              data-on={artifactTab === 'plans' ? 'true' : 'false'}
              aria-pressed={artifactTab === 'plans'}
              onClick={() => setArtifactTab('plans')}
            >
              {t("Plan")}</button>
          ) : null}
          <button
            type="button"
            className="plan-tab"
            data-on={artifactTab === 'changes' ? 'true' : 'false'}
            aria-pressed={artifactTab === 'changes'}
            onClick={() => setArtifactTab('changes')}
          >
            {t("Changes")}{changedFiles.length > 0 ? ` ${changedFiles.length}` : ''}
          </button>
        </div>
        {artifactTab === 'plans' && planVisible && offerBuild ? (
          <button
            type="button"
            className="plan-build"
            title={t("Switch to the workspace default policy and implement the plan")}
            disabled={policyBusy || Boolean(streaming) || !planView || planView.total === 0}
            onClick={() => void buildPlan()}
          >
            <IconPlay />
            {t("Build")}</button>
        ) : null}
        <button type="button" className="context-close" aria-label={t("Close artifacts")} onClick={closePlanPanel}>
          <IconClose />
        </button>
      </div>

      {artifactTab === 'plans' && planSurface ? (
        <div className="artifact-body">
          {planPanelLoading ? (
            <p className="plan-panel-status">{t("Loading plan")}</p>
          ) : planView ? (
            <>
              <div className="plan-pane-head artifact-plan-head">
                <h2 title={planView.name}>{planView.name}</h2>
                <div className="plan-tabs" role="group" aria-label={t("Plan view")}>
                  <button
                    type="button"
                    className="plan-tab"
                    data-on={tab === 'preview' ? 'true' : 'false'}
                    aria-pressed={tab === 'preview'}
                    onClick={() => setTab('preview')}
                  >
                    {t("Preview")}</button>
                  <button
                    type="button"
                    className="plan-tab"
                    data-on={tab === 'source' ? 'true' : 'false'}
                    aria-pressed={tab === 'source'}
                    onClick={() => setTab('source')}
                  >
                    {t("Source")}</button>
                </div>
              </div>
              {/* The checklist stays pinned while the plan document is read, so the
                  steps and the plan are read together instead of one after the other. */}
              <PlanMeter plan={planView} />
              <div className="plan-steps">
                <PlanTodoList plan={planView} />
              </div>
              <div className="plan-doc" data-tab={tab}>
                <div className="plan-pane-scroll">
                  {planPanelLoading ? <p className="plan-panel-status">{t("Loading plan")}</p> : null}
                  {/* Preview reads `body`, so the front matter and the generated
                      `<!-- todos:start -->` block stay out of the rendered document;
                      the steps are already shown above as the live checklist. Source
                      shows `markdown`, the file exactly as it is stored. */}
                  {!planPanelLoading ? (
                    tab === 'preview' ? (
                      <Markdown content={planView.body} />
                    ) : (
                      <pre className="plan-source">{planView.markdown}</pre>
                    )
                  ) : null}
                </div>
              </div>
            </>
          ) : <p className="plan-panel-status">{t("This chat has no plan yet.")}</p>}
        </div>
      ) : (
        <ChangedFiles files={changedFiles} loading={planPanelLoading} />
      )}



    </aside>
  );
}

function ChangedFiles({ files, loading }: { files: ChangedFile[]; loading: boolean }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  if (loading && files.length === 0) return <p className="plan-panel-status">{t("Loading changes")}</p>;
  if (files.length === 0) return <p className="plan-panel-status">{t("This chat changed no files.")}</p>;
  return (
    <div className="artifact-body">
      <div className="artifact-file-list">
        {files.map((file) => (
          <div key={file.path} className="artifact-file">
            <button
              type="button"
              className="artifact-file-row"
              data-open={openPath === file.path ? 'true' : 'false'}
              aria-expanded={openPath === file.path}
              onClick={() => setOpenPath(openPath === file.path ? null : file.path)}
              title={file.path}
            >
              <span className="artifact-file-name">{file.path}</span>
              <span className="artifact-counts">
                {file.added > 0 && <span className="artifact-added">+{file.added}</span>}
                {file.removed > 0 && <span className="artifact-removed">−{file.removed}</span>}
                {file.changes > 1 && <span className="artifact-times">{file.changes}{t("×")}</span>}
              </span>
            </button>
            {openPath === file.path && file.diff ? (
              <pre className="file-change-diff" data-language={languageForPath(file.path)}>
                {file.diff.split('\n').map((line, index) => (
                  <span
                    key={`${index}-${line}`}
                    className={diffLineClass(line)}
                    dangerouslySetInnerHTML={{ __html: highlightedDiffLine(line, languageForPath(file.path)) }}
                  />
                ))}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function clampPaneWidth(next: number, columnWidth: number): number {
  const maximum = Math.max(PANE_MIN_WIDTH, columnWidth - PANE_CHAT_MIN_WIDTH);
  return Math.min(Math.max(next, PANE_MIN_WIDTH), maximum);
}