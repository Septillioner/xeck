import { t } from '../i18n/index.ts';
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
  placeholder,
  title,
  'aria-label': ariaLabel,
  ...rest
}: ComponentProps<'input'> & { width?: 'wide' | 'block'; bare?: boolean }) {
  const labels = { placeholder: placeholder === undefined ? undefined : t(placeholder), title: title === undefined ? undefined : t(title), 'aria-label': ariaLabel === undefined ? undefined : t(ariaLabel) };
  if (bare) return <input {...rest} {...labels} className={className} />;
  return <input {...rest} {...labels} className={cn('field', width === 'wide' && 'field-wide', width === 'block' && 'field-block', className)} />;
}
