import { t } from '../../i18n/index.ts';
import type { TranscriptSubagentBlock } from '../../../../shared/types.ts';
import { IconSpark } from '../../ui/icons.tsx';

export function SubagentCard({ subagent, onOpen }: { subagent: TranscriptSubagentBlock; onOpen: (sessionId: string) => void }) {
  const status = subagent.status === 'done' ? 'Complete'
    : subagent.status === 'failed' ? 'Failed'
    : subagent.status === 'cancelled' ? 'Cancelled'
    : subagent.activity;
  return (
    <button type="button" className="subagent-card" data-status={subagent.status} aria-label={t("Open subagent {0} chat", { "0": subagent.agentId })} onClick={() => onOpen(subagent.sessionId)}>
      <span className="subagent-card-header">
        <IconSpark className="subagent-card-icon" />
        <strong>{t("Subagent")}</strong>
        <span className="subagent-card-agent">{subagent.agentId}</span>
      </span>
      <span className="subagent-card-status" role="status" aria-live="polite">
        {subagent.status === 'running' && <span className="subagent-card-dot" aria-hidden="true" />}
        {t(status)}
      </span>
    </button>
  );
}
