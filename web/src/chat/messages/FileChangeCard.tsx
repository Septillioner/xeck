import type { FileChange } from '../../../../shared/types.ts';
import { diffLineClass, highlightedDiffLine, languageForPath } from './diff-highlight.ts';

export function FileChangeCard({ change, defaultOpen }: { change: FileChange; defaultOpen?: boolean }) {
  const title = change.operation === 'write'
    ? 'File written'
    : change.operation === 'replace'
      ? 'Lines replaced'
      : change.operation === 'move'
        ? 'File moved'
        : change.operation === 'delete'
          ? 'File deleted'
          : 'Directory created';
  const summary = change.operation === 'move' && change.destination
    ? `${change.path} → ${change.destination}`
    : change.path;
  return (
    <details className="file-change-card" open={defaultOpen ?? Boolean(change.diff)}>
      <summary>
        <span>{title}</span>
        <code>{summary}</code>
        {change.truncated && <small>truncated</small>}
      </summary>
      {change.diff ? (
        <pre className="file-change-diff" data-language={languageForPath(change.path)}>
          {change.diff.split('\n').map((line, index) => (
            <span
              key={`${index}-${line}`}
              className={diffLineClass(line)}
              dangerouslySetInnerHTML={{ __html: highlightedDiffLine(line, languageForPath(change.path)) }}
            />
          ))}
        </pre>
      ) : (
        <p className="file-change-meta">
          {change.operation === 'delete' ? (change.recursive ? 'Recursive deletion' : 'Deleted') : 'Completed'}
        </p>
      )}
    </details>
  );
}
