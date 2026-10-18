import { t } from '../i18n/index.ts';
import { useState } from 'react';
import type { PlanSnapshot, PlanStatus, PlanTodo } from '../../../shared/types.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconAlert, IconCheck, IconPlay } from '../ui/icons.tsx';

/**
 * The checklist of a plan, shared by the plan card in the transcript and the
 * docked plan pane so both read the same way. Ticking a box goes through
 * `PUT /api/sessions/:id/plan/todos/:todoId`; the server's answer, including a
 * rejection when the revision moved on, is what the card reports.
 */
export function PlanTodoList({ plan, readOnly = false }: { plan: PlanSnapshot; readOnly?: boolean }) {
  const { togglePlanTodo } = useAppState();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (todo: PlanTodo) => {
    setBusyId(todo.id);
    try {
      await togglePlanTodo(todo.id, todo.status === 'completed' ? 'pending' : 'completed');
    } finally {
      // A rejected request must still release the row, otherwise `disabled`
      // leaves the whole checklist unusable until the chat is reopened.
      setBusyId(null);
    }
  };

  if (plan.todos.length === 0) return null;

  return (
    <ol className="plan-list">
      {plan.todos.map((todo, index) => (
        <li key={todo.id} className="plan-item" data-status={todo.status}>
          <button
            type="button"
            className="plan-check"
            data-checked={todo.status === 'completed' ? 'true' : 'false'}
            data-busy={busyId === todo.id ? 'true' : 'false'}
            disabled={readOnly || busyId !== null}
            aria-label={readOnly ? t("Step {0}: {1}", { "0": index + 1, "1": todo.status }) : todo.status === 'completed' ? t("Reopen step {0}", { "0": index + 1 }) : t("Complete step {0}", { "0": index + 1 })}
            title={readOnly ? undefined : todo.status === 'completed' ? t("Reopen this step") : t("Mark this step done")}
            onClick={() => void toggle(todo)}
          >
            <StatusGlyph status={todo.status} />
          </button>
          <span className="plan-body">
            {/* The index is what the model refers to (`Open steps: t2, t3`), so it
                leads the row; the generated id stays as the quiet reference. */}
            <span className="plan-index">{index + 1}</span>
            <span className="plan-content">{todo.content}</span>
            {todo.note ? <span className="plan-note">{todo.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One mark per status, so a step being worked on never looks like a step waiting. */
function StatusGlyph({ status }: { status: PlanStatus }) {
  if (status === 'completed') return <IconCheck />;
  if (status === 'in_progress') return <IconPlay />;
  if (status === 'blocked') return <IconAlert />;
  return null;
}
