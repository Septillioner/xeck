import hljs from 'highlight.js/lib/common';

export function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'file-change-line file-change-meta-line';
  if (line.startsWith('+')) return 'file-change-line file-change-added';
  if (line.startsWith('-')) return 'file-change-line file-change-removed';
  return 'file-change-line file-change-context';
}

export function languageForPath(filePath: string): string {
  const extension = filePath.split('.').at(-1)?.toLowerCase() ?? '';
  const aliases: Record<string, string> = {
    cjs: 'javascript',
    css: 'css',
    htm: 'xml',
    html: 'xml',
    js: 'javascript',
    json: 'json',
    jsx: 'javascript',
    md: 'markdown',
    mjs: 'javascript',
    mts: 'typescript',
    py: 'python',
    sh: 'bash',
    ts: 'typescript',
    tsx: 'typescript',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return aliases[extension] ?? extension;
}

export function highlightedDiffLine(line: string, language: string): string {
  const prefix = line[0] === '+' || line[0] === '-' || line[0] === ' ' ? line[0] : '';
  const source = prefix ? line.slice(1) : line;
  if (!language || !hljs.getLanguage(language)) return escapeHtml(line);
  const highlighted = hljs.highlight(source, { language }).value;
  return `${escapeHtml(prefix)}${highlighted}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
