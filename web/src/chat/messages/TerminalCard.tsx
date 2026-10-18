import { t } from '../../i18n/index.ts';
import type { TerminalResult } from '../../../../shared/types.ts';

export function TerminalCard({ terminal, pending }: { terminal: TerminalResult; pending?: boolean }) {
  const output = [terminal.stdout, terminal.stderr].filter(Boolean).join('\n');
  return (
    <details className="terminal-card" open>
      <summary>
        <span>{t("Terminal")}</span>
        <code>{terminal.cwd}</code>
        <small>{pending ? t('Running') : `${terminal.durationMs} ms`}</small>
      </summary>
      <div className="terminal-command">
        <span className="terminal-prompt">$</span>
        <code>{terminal.command}</code>
      </div>
      <pre className={terminal.ok ? 'terminal-output' : 'terminal-output terminal-error'}>
        {output ? <AnsiOutput value={output} /> : (pending ? t("Running…") : t('(no output)'))}
      </pre>
      {!pending && (
        <p className="terminal-status">
          {terminal.ok ? t("Exited 0") : terminal.timedOut ? t("Timed out") : t("Exited {0}", { "0": terminal.exitCode ?? terminal.signal ?? t('with error') })}
          {terminal.truncated ? ' · ' + t('output truncated') : ''}
        </p>
      )}
    </details>
  );
}

export function AnsiOutput({ value }: { value: string }) {
  return value.split('\n').map((line, index) => (
    <span key={`${index}-${line}`} className="terminal-output-line">
      {ansiSegments(line).map((segment, segmentIndex) => (
        <span key={`${index}-${segmentIndex}-${segment.text}`} className={segment.className}>{segment.text}</span>
      ))}
      {index < value.split('\n').length - 1 ? '\n' : ''}
    </span>
  ));
}

interface AnsiSegment {
  text: string;
  className?: string;
}

export function ansiSegments(value: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const pattern = /\u001b\[([0-9;]*)m/g;
  let activeClass: string | undefined;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) segments.push({ text: value.slice(cursor, match.index), className: activeClass });
    activeClass = ansiClass(match[1], activeClass);
    cursor = pattern.lastIndex;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), className: activeClass });
  return segments;
}

export function ansiClass(codes: string, current?: string): string | undefined {
  let next = current;
  for (const code of (codes || '0').split(';').map(Number)) {
    if (code === 0 || code === 39) next = undefined;
    else if (code === 1) next = `${next ?? ''} ansi-bold`;
    else if (code >= 30 && code <= 37) next = `ansi-${ANSI_COLORS[code - 30]}`;
    else if (code >= 90 && code <= 97) next = `ansi-bright-${ANSI_COLORS[code - 90]}`;
  }
  return next;
}
export const ANSI_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;
