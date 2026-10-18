import { t } from '../i18n/index.ts';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useAppState } from '../state/AppState.tsx';
import type { ContextPartKey, ContextParts, ContextTree } from '../../../shared/types.ts';
import { IconClose } from '../ui/icons.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { ContextMeterDock } from './ContextMeter.tsx';
import { formatTokenCount } from '../lib/format-tokens.ts';
import type { ActivityCall } from './activity-calls.ts';

type ContextTone = ContextPartKey;

/** Categories the library measures but the context tree has no nodes for; only their token totals show. */
const TOKEN_ONLY_SECTIONS: { key: 'toolCalls' | 'toolResults' | 'providerMeta'; title: string }[] = [
  { key: 'toolCalls', title: 'Tool calls' },
  { key: 'toolResults', title: 'Tool results' },
  { key: 'providerMeta', title: 'Provider metadata' },
];

const EXCERPT_LENGTH = 48;
const DEBUG_INLINE_MAX_CHARS = 480;
const DEBUG_PANE_DEFAULT_WIDTH = 360;
const DEBUG_PANE_MIN_WIDTH = 280;
const DEBUG_PANE_CHAT_MIN_WIDTH = 320;
const DEBUG_PANE_COLLAPSED_WIDTH = 36;

let rememberedWidth = DEBUG_PANE_DEFAULT_WIDTH;

export function ContextSidebar({
  tree,
  parts,
  error,
  selection,
}: {
  tree: ContextTree | null;
  parts: ContextParts | null;
  error: string | null;
  selection: ActivityCall | null;
}) {
  const paneRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [width, setWidth] = useState(rememberedWidth);
  const [dragging, setDragging] = useState(false);
  // Owned by the app state so the mobile top bar can drive the same flag.
  const { debugOpen: open, setDebugOpen, active } = useAppState();
  const changeOpen = setDebugOpen;

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
    const columnWidth = paneRef.current?.parentElement?.clientWidth ?? drag.startWidth + DEBUG_PANE_CHAT_MIN_WIDTH;
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

  if (!open) {
    return (
      <aside ref={paneRef} className="context-sidebar" data-open="false" style={{ '--pane-width': `${DEBUG_PANE_COLLAPSED_WIDTH}px` } as CSSProperties} aria-label={t("Debug")}>
        <button type="button" className="context-reopen" onClick={() => changeOpen(true)}>
          {t("Debug")}</button>
      </aside>
    );
  }

  return (
    <aside ref={paneRef} className="context-sidebar" data-open="true" style={{ '--pane-width': `${width}px` } as CSSProperties} aria-label={t("Debug")}>
      <button
        type="button"
        className="context-resize"
        aria-label={t("Resize debug pane")}
        data-active={dragging ? 'true' : 'false'}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
      />
      <div className="context-head">
        <h2>{t("Debug")}</h2>
        <button type="button" className="context-close" aria-label={t("Close debug pane")} onClick={() => changeOpen(false)}>
          <IconClose />
        </button>
      </div>
      {active && <p className="context-identity">{identityLine(active)}</p>}
      <div className="context-scroll">
        {selection && <CallDetail call={selection} />}
        {error && <p className="context-empty">{t(error)}</p>}
        {tree && <ContextTreeView tree={tree} parts={parts} />}
      </div>
      <div className="context-dock">
        <ContextMeterDock />
      </div>
    </aside>
  );
}

function clampPaneWidth(next: number, columnWidth: number): number {
  const upper = Math.max(DEBUG_PANE_MIN_WIDTH, columnWidth - DEBUG_PANE_CHAT_MIN_WIDTH);
  return Math.min(Math.max(next, DEBUG_PANE_MIN_WIDTH), upper);
}

/**
 * Debug transparency line: the session's agent and workspace. Legacy sessions
 * carry `general@1`/`main` (or nothing) — those read as the coder identity,
 * mirroring the host's alias resolution.
 */
function identityLine(session: { agentId?: string; workspace?: string }): string {
  const storedAgent = session.agentId ?? 'coder';
  const storedWorkspace = session.workspace ?? 'coding@1';
  const agentId = storedAgent === 'main' ? 'coder' : storedAgent;
  const workspace = storedWorkspace === 'general@1' ? 'coding@1' : storedWorkspace;
  return `${agentId} · ${workspace}`;
}

function CallDetail({ call }: { call: ActivityCall }) {
  const result = call.pending ? t('Waiting') : (call.result ?? '');
  return (
    <div className="context-detail">
      <h3>{call.label}</h3>
      <p className="section-label">{t("Arguments")}</p>
      <TextBlock title={t("{0} arguments", { "0": call.label })} text={formatValue(call.args)} />
      <p className="section-label">{t("Result")}</p>
      <TextBlock title={t("{0} result", { "0": call.label })} text={result} />
    </div>
  );
}

function ContextTreeView({ tree, parts }: { tree: ContextTree; parts: ContextParts | null }) {
  return (
    <div className="context-tree">
      <Section title={t("System prompt")} tone="system" count={tree.system.length} tokens={parts?.system}>
        <TextBlock title={t("System prompt")} text={tree.system} />
      </Section>
      <Section title={t("Tool definitions")} tone="tools" count={tree.tools.length} tokens={parts?.tools}>
        <TextBlock title={t("Tool definitions")} text={tree.tools} />
      </Section>
      <Section title={t("Rules")} tone="rules" count={tree.rules.length} tokens={parts?.rules}>
        {tree.rules.map((rule, index) => (
          <Leaf key={`${index}-${rule.slice(0, EXCERPT_LENGTH)}`} title={excerpt(rule)}>
            <TextBlock title={excerpt(rule)} text={rule} />
          </Leaf>
        ))}
      </Section>
      <Section title={t("Skills")} tone="skills" count={tree.skills.length} tokens={parts?.skills}>
        {tree.skills.map((skill) => (
          <Leaf key={skill.name} title={skill.name} hint={excerpt(skill.description || skill.content)}>
            <TextBlock title={t("{0} description", { "0": skill.name })} text={skill.description} />
            {skill.loaded && <TextBlock title={skill.name} text={skill.content} />}
          </Leaf>
        ))}
      </Section>
      <Section title={t("MCP")} tone="mcp" count={tree.mcp.length} tokens={parts?.mcp}>
        {tree.mcp.map((tool) => (
          <Leaf key={tool.name} title={tool.name} hint={excerpt(tool.description)}>
            <TextBlock title={t("{0} description", { "0": tool.name })} text={tool.description} />
            <TextBlock title={t("{0} schema", { "0": tool.name })} text={tool.schema} />
          </Leaf>
        ))}
      </Section>
      <Section title={t("Summarized conversation")} tone="summary" count={tree.summary.length} tokens={parts?.summary}>
        {tree.summary.map((text, index) => (
          <Leaf key={`${index}-${text.slice(0, EXCERPT_LENGTH)}`} title={excerpt(text)}>
            <TextBlock title={excerpt(text)} text={text} />
          </Leaf>
        ))}
      </Section>
      <Section title={t("Conversation")} tone="conversation" count={tree.conversation.length} tokens={parts?.conversation}>
        {tree.conversation.map((message, index) => (
          <Leaf key={`${index}-${message.role}`} title={message.role} hint={excerpt(message.content)}>
            <TextBlock title={message.role} text={message.content} />
          </Leaf>
        ))}
      </Section>
      {TOKEN_ONLY_SECTIONS.map(({ key, title }) => {
        // Sessions stored before the ten-way split have no value for these keys.
        const tokens = parts?.[key];
        return typeof tokens === 'number' && tokens > 0
          ? <Section key={key} title={title} tone={key} count={0} tokens={tokens}>{null}</Section>
          : null;
      })}
    </div>
  );
}

function Section({
  title,
  tone,
  count,
  tokens,
  children,
}: {
  title: string;
  tone: ContextTone;
  count: number;
  tokens?: number;
  children: ReactNode;
}) {
  const mark = <span className={`meter-swatch meter-${tone}`} />;
  const tokenLabel = typeof tokens === 'number' ? `${formatTokenCount(tokens)} tok` : null;
  if (count === 0) {
    return (
      <div className="context-node" data-empty="true">
        <div className="context-summary">
          {mark}
          <span className="context-label">{t(title)}</span>
          {tokenLabel && (
            <span className="context-meta">
              <span className="context-tokens">{tokenLabel}</span>
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <details className="context-node">
      <summary>
        {mark}
        <span className="context-label">{t(title)}</span>
        <span className="context-meta">
          {tokenLabel && <span className="context-tokens">{tokenLabel}</span>}
          <span className="context-count">{count}</span>
          <i className="chevron" />
        </span>
      </summary>
      <div className="context-node-body">
        <span className={`context-rail meter-${tone}`} />
        {children}
      </div>
    </details>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (text.length <= DEBUG_INLINE_MAX_CHARS) return <pre className="context-block">{text}</pre>;
  return (
    <>
      <div className="context-preview">
        <span className="context-excerpt">{excerpt(text)}</span>
        <button type="button" className="text-button" onClick={() => setOpen(true)}>
          {t("View")}</button>
      </div>
      {open && (
        <Dialog title={title} onClose={() => setOpen(false)}>
          <pre className="context-view">{text}</pre>
        </Dialog>
      )}
    </>
  );
}

function Leaf({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="context-node">
      <summary>
        <span className={hint ? 'context-label' : 'context-label context-label-fill'}>{t(title)}</span>
        {hint && <span className="context-excerpt">{hint}</span>}
        <i className="chevron" />
      </summary>
      <div className="context-node-body">{children}</div>
    </details>
  );
}

function excerpt(text: string): string {
  const line = text.split('\n').find((part) => part.trim()) ?? '';
  const trimmed = line.trim();
  if (trimmed.length <= EXCERPT_LENGTH) return trimmed;
  return `${trimmed.slice(0, EXCERPT_LENGTH)}…`;
}

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}
