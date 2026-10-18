import { t, useI18n } from '../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconXeck } from '../ui/icons.tsx';
import { currentActivity, type ActivitySignal } from './tool-usage.ts';

/** Activity follows the response in transcript flow, independently of tool visibility. */
export function XeckPulse({ signal }: { signal: ActivitySignal | null }) {
  const position = useRef<HTMLDivElement>(null);
  const previousTop = useRef<number | null>(null);
  const movement = useRef<Animation | null>(null);
  const [displaySignal, setDisplaySignal] = useState<ActivitySignal | null>(signal);
  const [exiting, setExiting] = useState(false);
  const [now, setNow] = useState(Date.now);
  const retryAt = displaySignal?.rateLimit?.retryAt;
  // Animate layout shifts as the revealed response adds lines above the pulse.
  useLayoutEffect(() => {
    const node = position.current;
    if (!node) { previousTop.current = null; return; }
    const top = node.offsetTop;
    const previous = previousTop.current;
    previousTop.current = top;
    if (previous === null || previous === top) return;
    movement.current?.cancel();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    movement.current = node.animate([
      { translate: `0 ${previous - top}px` },
      { translate: '0 0' },
    ], { duration: 180, easing: 'ease-out' });
  });
  useEffect(() => {
    if (signal) {
      setDisplaySignal(signal);
      setExiting(false);
      return;
    }
    if (!displaySignal) return;
    const timer = window.setTimeout(() => setExiting(true), 550);
    return () => window.clearTimeout(timer);
  }, [signal, displaySignal]);
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => {
      setDisplaySignal(null);
      setExiting(false);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [exiting]);
  useEffect(() => {
    if (!retryAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  if (!displaySignal) return null;

  const activity = currentActivity(displaySignal);
  const remaining = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  return (
    <div ref={position} className="xeck-pulse" data-mood={activity.mood} data-exiting={exiting || undefined} role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">{t(activity.label)}</span>
      <div className="xeck-pulse-body" aria-hidden="true">
        <span className="xeck-pulse-content">
          <span className="xeck-pulse-mark"><IconXeck size={26} /></span>
          <PulseLabel label={t(activity.label)} remaining={remaining} />
        </span>
      </div>
    </div>
  );
}

/** Retain the outgoing wording until the incoming wording has rolled into place. */
function PulseLabel({ label, remaining }: { label: string; remaining: number }) {
  const { locale } = useI18n();
  const [labels, setLabels] = useState({ current: label, previous: null as string | null, revision: 0 });
  const [width, setWidth] = useState<number>();
  const currentLine = useRef<HTMLSpanElement>(null);
  if (label !== labels.current) {
    setLabels({ current: label, previous: labels.current, revision: labels.revision + 1 });
  }
  useLayoutEffect(() => {
    if (currentLine.current) setWidth(currentLine.current.getBoundingClientRect().width);
  }, [labels.current, remaining, locale]);
  useEffect(() => {
    if (labels.previous === null) return;
    const timer = window.setTimeout(() => setLabels((value) => ({ ...value, previous: null })), 380);
    return () => window.clearTimeout(timer);
  }, [labels.revision, labels.previous]);

  return (
    <span className="xeck-pulse-copy" style={{ width }}>
      {labels.previous !== null && (
        <span className="xeck-pulse-line" data-leaving="true" key={`previous-${labels.revision}`}>
          {t(labels.previous)}
        </span>
      )}
      <span className="xeck-pulse-line" ref={currentLine} data-entering={labels.previous !== null || undefined} key={`current-${labels.revision}`}>
        <span className="xeck-pulse-label">
          {Array.from(t(labels.current)).map((letter, index) => (
            <span className="xeck-pulse-letter" key={index} style={{ animationDelay: `${(index + 1) * 40}ms` }}>{letter}</span>
          ))}
        </span>
        {labels.current === 'Waiting to retry' && remaining > 0 && (
          <span className="xeck-pulse-retry"> · {remaining}{t("s")}</span>
        )}
      </span>
    </span>
  );
}
