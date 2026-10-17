import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

/* The one single-line input: soft field fill, control radius, 36px (40px on touch),
   2px ink focus outline from base.css. `width` picks the settings-row width ('wide' =
   16rem, 'block' = fill the parent); `bare` is for inputs that sit inside a container
   that already paints the field (search rows) and only forwards the element. */
export function TextField({
  className,
  width,
  bare = false,
  ...rest
}: ComponentProps<'input'> & { width?: 'wide' | 'block'; bare?: boolean }) {
  if (bare) return <input {...rest} className={className} />;
  return <input {...rest} className={cn('field', width === 'wide' && 'field-wide', width === 'block' && 'field-block', className)} />;
}
