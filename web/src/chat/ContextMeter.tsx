import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { type ContextPartKey } from '../../../shared/types.ts';
import { effectiveContextLength } from '../../../shared/model-context.ts';
import { useAppState } from '../state/AppState.tsx';
import { formatTokenCount, formatTokenSpeed } from '../lib/format-tokens.ts';
import { contextMeterValues, type ContextPressureLevel } from './context-meter-values.ts';

const PERCENT_FULL = 100;

const PART_LABELS: Record<ContextPartKey, string> = {
  system: 'System prompt',
  tools: 'Tool definitions',
  rules: 'Rules',
  skills: 'Skills',
  mcp: 'MCP',
  summary: 'Summarized conversation',
  conversation: 'Conversation',
  toolCalls: 'Tool calls',
  toolResults: 'Tool results',
  providerMeta: 'Provider metadata',
};
const RING_SIZE = 16;
const RING_STROKE = 1.75;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ContextMeter() {
  const meter = useContextMeter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!meter) return null;

  return (
    <div className="meter-wrap" ref={rootRef}>
      {open && (
        <div className="meter-pop" role="dialog" aria-labelledby={titleId}>
          <ContextBreakdown meter={meter} titleId={titleId} />
        </div>
      )}
      <button
        type="button"
        className="meter"
        data-level={meter.level ?? undefined}
        aria-expanded={open}
        aria-label={meter.label}
        onClick={() => setOpen((current) => !current)}
      >
        <Ring ratio={meter.ratio} level={meter.level} />
        <span>{meter.label}</span>
      </button>
    </div>
  );
}

export function ContextMeterDock() {
  const meter = useContextMeter();
  if (!meter) return null;
  return (
    <details className="context-meter-dock">
      <summary>
        <Ring ratio={meter.ratio} level={meter.level} />
        <span>{meter.label}</span>
        <i className="chevron" />
      </summary>
      <ContextBreakdown meter={meter} />
    </details>
  );
}

function useContextMeter() {
  const { active, catalog, providers, settings, streaming } = useAppState();
  // A running turn publishes its own occupancy after every model request, so the
  // meter follows the tool rounds instead of waiting for the turn to finish.
  const live = streaming?.contextUsage;
  const last = live ?? active?.lastUsage;
  if (!settings.showUsage || !last || !active) return null;
  const catalogEntry = catalog.find(
    (entry) => entry.provider === active.profile.provider && entry.model === active.profile.model,
  );
  const modelContextLength = catalogEntry?.contextLength
    ?? providers.find((provider) => provider.kind === active.profile.provider)?.contextLengths?.[active.profile.model];
  const limit = effectiveContextLength(active.profile.model, modelContextLength, catalogEntry?.maxContextEnabled);
  const context = live ?? active.contextUsage ?? last;
  const values = contextMeterValues(context, limit, streaming?.contextParts ?? active.contextParts);
  const label = values.maximum
    ? `${formatTokenCount(values.current)} / ${formatTokenCount(values.maximum)}`
    : `${formatTokenCount(values.current)} · Limit unknown`;
  const speed = settings.showTokenSpeed ? formatTokenSpeed(last.completionTokens, active.lastDurationMs ?? 0) : null;
  const perRequest = Boolean(live) || Boolean(active.contextUsage);
  return {
    ...values,
    label,
    speed,
    context,
    inputCaption: live
      ? 'Live request input'
      : perRequest
        ? 'Last request input'
        : 'Legacy turn input · Updates after the next message',
    outputLabel: perRequest ? 'Last request output' : 'Turn output',
    cumulative: active.usage?.totalTokens,
  };
}

function ContextBreakdown({
  meter,
  titleId,
}: {
  meter: NonNullable<ReturnType<typeof useContextMeter>>;
  titleId?: string;
}) {
  return (
    <div className="meter-panel" data-level={meter.level ?? undefined}>
      <div className="meter-head">
        <p id={titleId}>Context</p>
        <span>{meter.percent !== null ? `${meter.percent}%` : 'Limit unknown'}</span>
      </div>
      <div
        className="meter-bar"
        role={meter.ratio !== null ? 'meter' : 'img'}
        aria-valuemin={meter.ratio !== null ? 0 : undefined}
        aria-valuemax={meter.ratio !== null ? PERCENT_FULL : undefined}
        aria-valuenow={meter.percent ?? undefined}
        aria-label={meter.label}
      >
        {meter.parts.map((part) => (
          <span
            key={part.key}
            className={`meter-seg meter-${part.key}`}
            style={{ '--meter-part': part.fraction } as CSSProperties}
          />
        ))}
      </div>
      <p className="meter-caption">{meter.label}</p>
      <p className="meter-caption">{meter.inputCaption}</p>
      <dl className="meter-legend">
        {meter.parts.map((part) => (
          <div key={part.key}>
            <dt>
              <span className={`meter-swatch meter-${part.key}`} />
              {PART_LABELS[part.key]}
            </dt>
            <dd>{formatTokenCount(part.tokens)}</dd>
          </div>
        ))}
      </dl>
      <dl className="meter-stats">
        <MeterStat label={meter.outputLabel} value={formatTokenCount(meter.context.completionTokens)} />
        {meter.context.cachedTokens ? <MeterStat label="Cached input" value={formatTokenCount(meter.context.cachedTokens)} /> : null}
        {typeof meter.cumulative === 'number' ? <MeterStat label="Cumulative usage" value={formatTokenCount(meter.cumulative)} /> : null}
        {meter.speed ? <MeterStat label="Speed" value={meter.speed} /> : null}
      </dl>
    </div>
  );
}

function MeterStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Ring({ ratio, level }: { ratio: number | null; level: ContextPressureLevel | null }) {
  if (ratio === null) return null;
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  return (
    <svg
      className="meter-ring"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      data-level={level ?? undefined}
      aria-hidden="true"
    >
      <circle className="meter-track" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} strokeWidth={RING_STROKE} />
      {ratio > 0 ? (
        <circle
          className="meter-fill"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      ) : null}
    </svg>
  );
}

