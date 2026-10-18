import { t } from '../i18n/index.ts';
import type { ReactNode } from 'react';

export function SettingCard({ children }: { children: ReactNode }) {
  return <section className="setting-card">{children}</section>;
}

export function SettingRow({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{t(label)}</strong>
        {detail && <p>{t(detail)}</p>}
      </div>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  label,
  pending = false,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  label: string;
  pending?: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-label={t(label)}
      aria-checked={checked}
      aria-busy={pending}
      disabled={disabled || pending}
      data-on={checked ? 'true' : 'false'}
      data-pending={pending ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
    >
      {pending ? <span className="control-spinner" aria-hidden="true" /> : <span />}
    </button>
  );
}
