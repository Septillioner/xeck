import { t } from '../../i18n/index.ts';
import { useEffect, useState } from 'react';
import type { RateLimitWait } from './types.ts';

export const RATE_LIMIT_LABEL = 'Rate limit reached, retrying';

export function ThinkingLine({ label, live }: { label: string; live: boolean }) {
  return (
    <p className="status-line" aria-label={t(label)}>
      <span className={live ? 'shimmer-text' : undefined}>{t(label)}</span>
    </p>
  );
}

/**
 * The provider hit a TPM/RPM limit and is waiting out the window before it
 * retries, so the turn keeps running instead of failing. Counts down locally.
 */
export function RateLimitLine({ wait }: { wait: RateLimitWait }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wait.retryAt]);

  const remaining = Math.max(0, Math.ceil((wait.retryAt - now) / 1000));
  const label = remaining > 0 ? t("Rate limit reached, retrying in {count}s", { count: remaining }) : t(RATE_LIMIT_LABEL);
  return (
    <p className="status-line" aria-label={t(RATE_LIMIT_LABEL)}>
      <span className="shimmer-text">{t(label)}</span>
    </p>
  );
}

export function Reasoning({ text, live = false }: { text: string; live?: boolean }) {
  return (
    <details className="reasoning" open={live ? true : undefined}>
      <summary>
        <span className={live ? 'shimmer-text' : undefined}>{t("Thinking")}</span>
        <i className="chevron" />
      </summary>
      <p>{text}</p>
    </details>
  );
}
