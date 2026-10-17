import type { PlanSnapshot } from '../../../../shared/types.ts';
import { useAppState } from '../../state/AppState.tsx';
import { IconFileText, IconPlay } from '../../ui/icons.tsx';
import { PlanMeter } from '../PlanMeter.tsx';
import { PlanTodoList } from '../PlanTodoList.tsx';

/**
 * The plan a `plan_write` or `todo_update` call produced: title, progress and
 * the checklist. Clicking the card opens the docked plan pane. Ticking a box
 * stops there: the step is the user's call, not a way to open the pane.
 */
export function PlanCard({ plan }: { plan: PlanSnapshot }) {
  const { active, offerBuild, streaming, openPlanPanel } = useAppState();
  const readOnly = active?.origin?.by === 'agent';

  return (
    <div
      className="group my-2 rounded-card bg-chip p-4 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      data-openable={readOnly ? undefined : 'true'}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      title={readOnly ? undefined : 'Open the plan panel'}
      onClick={readOnly ? undefined : () => void openPlanPanel()}
      onKeyDown={(event) => {
        if (readOnly) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void openPlanPanel();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-field text-muted">
          <IconFileText />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted">Plan</span>
          <span className="block truncate text-sm font-semibold text-ink underline decoration-track underline-offset-4 group-hover:decoration-muted">
            {plan.name}
          </span>
        </span>
      </div>
      <PlanMeter plan={plan} />
      {/* Ticking a step and starting the work are the user's calls, so they stop
          the click here instead of also opening the pane. */}
      <div
        className="mt-3 pt-2"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <PlanTodoList plan={plan} readOnly={readOnly} />
      </div>
      {!readOnly && offerBuild && plan.total > 0 && !streaming ? <BuildPlanButton /> : null}
    </div>
  );
}

/** Moves the chat to the agent policy and asks for the work to start. */
function BuildPlanButton() {
  const { buildPlan, policyBusy } = useAppState();
  return (
    <div className="plan-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="plan-build" disabled={policyBusy} onClick={() => void buildPlan()}>
        <IconPlay />
        Build
      </button>
      <span className="plan-hint">Switches to the agent policy and starts the work</span>
    </div>
  );
}
