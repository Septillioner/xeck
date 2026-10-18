import { t } from '../i18n/index.ts';
import type { BotColor } from '../../../shared/types.ts';
import { cn } from '../lib/cn.ts';

export const BOT_COLOR_CLASSES: Record<BotColor, string> = {
  blue: 'bg-tint-remote-bg text-tint-remote-ink',
  violet: 'bg-tint-customize-bg text-tint-customize-ink',
  pink: 'bg-tint-star-bg text-tint-star-ink',
  gray: 'bg-tint-general-bg text-tint-general-ink',
};

export function BotAvatar({ name, color, className }: { name: string; color: BotColor; className?: string }) {
  return <span aria-hidden="true" className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-small font-semibold', BOT_COLOR_CLASSES[color], className)}>{Array.from(name.trim())[0]?.toLocaleUpperCase() ?? t("X")}</span>;
}
