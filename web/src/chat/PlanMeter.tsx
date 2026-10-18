import { t } from '../i18n/index.ts';
import type { PlanSnapshot } from '../../../shared/types.ts';

/**
 * How far a plan has got. A bare "2/5" reads as nothing, so the count sits on
 * a filled track: the length is the answer and the digits only confirm it. A
 * plan with no steps reports 0% rather than pretending to be a full bar.
 */
export function PlanMeter({ plan }: { plan: PlanSnapshot }) {
  const percent = plan.total === 0 ? 0 : Math.round((plan.done / plan.total) * 100);
  const done = plan.total > 0 && plan.done === plan.total;
  return (
    <div
      className="plan-meter"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={plan.total}
      aria-valuenow={plan.done}
      aria-label={t("Plan progress")}
    >
      <span className="plan-meter-track">
        <span className="plan-meter-fill" style={{ width: `${percent}%` }} data-state={done ? 'done' : 'open'} />
      </span>
      <span className="plan-meter-count">
        {plan.done}/{plan.total}
      </span>
    </div>
  );
}