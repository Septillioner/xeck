import type { ComponentProps } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { cn } from '../lib/cn.ts';

/* The one multi-line field outside the composer: soft field fill, control
   radius, row-based min/max height (it grows with its text, then scrolls). */
const TEXTAREA_MIN_ROWS = 3;
const TEXTAREA_MAX_ROWS = 12;

export function Textarea({
  className,
  minRows = TEXTAREA_MIN_ROWS,
  maxRows = TEXTAREA_MAX_ROWS,
  ...rest
}: ComponentProps<typeof TextareaAutosize>) {
  return <TextareaAutosize {...rest} minRows={minRows} maxRows={maxRows} className={cn('field field-area', className)} />;
}
