import { t } from '../i18n/index.ts';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const LANGUAGE_CLASS = /language-([\w-]+)/;
const COPY_LABEL = 'Copy';
const COPIED_LABEL = 'Copied';
const COPIED_HOLD_MS = 2000;

export function Markdown({ content }: { content: string }) {
  return (
    <div className="transcript">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock, a: ExternalAnchor }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Transcript links leave the app: a new browser tab in the browser build, and
 * the main process opens the system browser in the Electron build. Left alone,
 * a left click would navigate the single app window away from Xeck.
 */
function ExternalAnchor({ href, children }: ComponentProps<'a'>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const text = nodeText(children).replace(/\n$/, '');
  const language = readLanguage(children) || 'text';
  const lines = text.length > 0 ? text.split('\n') : [''];
  const [copied, setCopied] = useState(false);
  const holdRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (holdRef.current !== null) window.clearTimeout(holdRef.current);
  }, []);

  function onCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
      holdRef.current = window.setTimeout(() => {
        holdRef.current = null;
        setCopied(false);
      }, COPIED_HOLD_MS);
    });
  }

  return (
    <div className="code-card">
      <header>
        <span>{language}</span>
        <button type="button" data-copied={copied ? 'true' : 'false'} aria-live="polite" onClick={onCopy}>
          {t(copied ? COPIED_LABEL : COPY_LABEL)}
        </button>
      </header>
      <pre>
        <code>
          {lines.map((line, index) => (
            <span className="code-line" key={`${index}-${line}`}>
              <span className="code-gutter">{index + 1}</span>
              <span>{line || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function readLanguage(node: ReactNode): string {
  const child = Array.isArray(node) ? node[0] : node;
  if (!child || typeof child !== 'object' || !('props' in child)) return '';
  const className = (child as { props?: { className?: string } }).props?.className ?? '';
  return LANGUAGE_CLASS.exec(className)?.[1] ?? '';
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    const element = node as { props?: { children?: ReactNode } };
    return nodeText(element.props?.children);
  }
  return '';
}
