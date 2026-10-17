import { useTypedTitle } from './use-typed-text.ts';

/**
 * A title that is written out when it changes. Labels, search and tooltips keep
 * reading the untouched string, so only the visible text is animated, and
 * `data-typing` carries the caret while the reveal runs.
 */
export function TypingText({ text, className }: { text: string; className?: string }) {
  const typed = useTypedTitle(text);
  return (
    <span className={className} data-typing={typed.length < text.length ? 'true' : undefined}>
      {typed}
    </span>
  );
}
