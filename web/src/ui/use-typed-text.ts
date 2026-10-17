import { useEffect, useRef, useState } from 'react';

/** Reduced motion means no reveal at all: every target is shown complete. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** A changed title is typed at this pace. */
const TITLE_CHARS_PER_SECOND = 38;
/** A long title is typed faster, so the whole reveal stays under this. */
const TITLE_MAX_DURATION_MS = 900;

/**
 * A live answer is revealed at this pace, which is quicker than any provider
 * streams, so the visible text never trails the turn on its own.
 */
const STREAM_CHARS_PER_SECOND = 180;
/** Past this lag the steady pace is abandoned, so a burst drains in a blink. */
const STREAM_MAX_BACKLOG_CHARS = 80;
/** Catching up: reveal this multiple of the pending backlog per second. */
const STREAM_CATCH_UP_PER_SECOND = 8;

/**
 * The transcript re-parses its markdown on every reveal step, so the steps stay
 * coarse on purpose: 30 a second already reads as a steady flow, and a finer
 * tick only costs frames the stream then has to wait for.
 */
const REVEAL_TICK_MS = 33;

/**
 * `every-change` types the new text from its first character, so an edited title
 * is written again. `growth-only` keeps what is already on screen and reveals
 * only the appended end, so a growing answer is typed but never restarted; any
 * other change (another chat, a replay) is shown complete instead.
 */
type RevealPolicy = 'every-change' | 'growth-only';

let reducedMotion: MediaQueryList | null = null;

function prefersReducedMotion(): boolean {
  reducedMotion ??= window.matchMedia(REDUCED_MOTION_QUERY);
  return reducedMotion.matches;
}

/** Characters per second for a step's worth of backlog, per policy. */
function revealCharsPerSecond(backlog: number, policy: RevealPolicy, targetLength: number): number {
  if (policy === 'every-change') return Math.max(TITLE_CHARS_PER_SECOND, (targetLength * 1000) / TITLE_MAX_DURATION_MS);
  if (backlog <= STREAM_MAX_BACKLOG_CHARS) return STREAM_CHARS_PER_SECOND;
  return Math.max(STREAM_CHARS_PER_SECOND, backlog * STREAM_CATCH_UP_PER_SECOND);
}

/**
 * Characters of `target` that may be shown yet. The reveal is a delay, never a
 * filter: the first render and any target that does not continue what is
 * already shown are revealed at once, so opening a chat, refreshing the page or
 * loading history never animates.
 */
function useRevealedLength(target: string, policy: RevealPolicy): number {
  const [revealed, setRevealed] = useState(() => target.length);
  const revealedRef = useRef(revealed);
  const targetRef = useRef(target);
  const previousTargetRef = useRef(target);
  const carryRef = useRef(0);

  // A new target either continues the shown text or replaces it outright.
  useEffect(() => {
    const previous = previousTargetRef.current;
    previousTargetRef.current = target;
    targetRef.current = target;
    if (target === previous) return;

    const showComplete = () => {
      revealedRef.current = target.length;
      carryRef.current = 0;
      setRevealed(target.length);
    };

    if (prefersReducedMotion()) {
      showComplete();
      return;
    }
    if (policy === 'every-change') {
      revealedRef.current = 0;
      carryRef.current = 0;
      setRevealed(0);
      return;
    }
    if (!target.startsWith(previous.slice(0, revealedRef.current))) showComplete();
  }, [target, policy]);

  const revealing = revealed < target.length && !prefersReducedMotion();

  // One interval for the whole reveal. It reads the target through a ref, so a
  // growing answer never restarts it, and it stops when the target is caught.
  useEffect(() => {
    if (!revealing) return;
    const timer = window.setInterval(() => {
      const backlog = targetRef.current.length - revealedRef.current;
      if (backlog <= 0) return;
      const rate = revealCharsPerSecond(backlog, policy, targetRef.current.length);
      const amount = carryRef.current + (rate * REVEAL_TICK_MS) / 1000;
      const take = Math.max(1, Math.floor(amount));
      carryRef.current = amount - take;
      const next = Math.min(targetRef.current.length, revealedRef.current + take);
      if (next >= targetRef.current.length) carryRef.current = 0;
      revealedRef.current = next;
      setRevealed(next);
    }, REVEAL_TICK_MS);
    return () => window.clearInterval(timer);
  }, [revealing, policy]);

  return revealed;
}

/** The part of a changed title that has been typed so far. */
export function useTypedTitle(title: string): string {
  return title.slice(0, useRevealedLength(title, 'every-change'));
}

/** How many characters of a growing answer may be shown yet. */
export function useStreamRevealLength(content: string): number {
  return useRevealedLength(content, 'growth-only');
}
