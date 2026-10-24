import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The theme tokens in `styles/theme.css` that twMerge cannot guess. Without
 * them `text-ui` reads as a text color and silently drops `text-ink` (or the
 * other way round) whenever both reach one `cn()` call. Keep this list in step
 * with the `--text-*`, `--radius-*` and control `--spacing-*` tokens.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['nano', 'micro', 'small', 'ui', 'body', 'lead', 'brand', 'large', 'heading', 'display'],
      radius: ['tile', 'control', 'row', 'card'],
      spacing: ['control', 'control-sm', 'field', 'control-pad', 'row'],
    },
  },
});

/**
 * Joins class names and resolves Tailwind conflicts.
 *
 * `clsx` flattens conditionals, arrays and objects; `twMerge` then drops the
 * earlier utility when two target the same property, so the last one written is
 * the one that applies. That is what lets a variant be added conditionally
 * without the caller having to reason about which base utility to remove.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}