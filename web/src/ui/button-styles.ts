/**
 * Class strings for buttons written in JSX. Every value is a theme token from
 * `styles/theme.css` (`h-control`, `rounded-control`, `text-ui`, `bg-primary`,
 * ...), so a button never carries a raw size or color. Variants are complete
 * strings, not layers: Tailwind orders conflicting utilities by stylesheet
 * position, not by the order written, so layering `hover:` colors would be a
 * coin flip.
 *
 * Buttons styled by class (`.text-button`, `.actions button`, modal footers)
 * get the same geometry from `styles/components.css`.
 */
const BASE =
  'inline-flex h-control flex-none items-center justify-center gap-1.5 rounded-control px-control-pad text-ui font-medium whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:flex-none hover-none:min-h-9';

export const BUTTON = {
  /** Default: tone-filled, quiet. */
  secondary: `${BASE} bg-field text-ink hover:bg-chat-active`,
  /** Borderless, for Cancel and other low-emphasis actions. */
  ghost: `${BASE} text-muted hover:bg-hover hover:text-ink`,
  /** The one filled action in a view. Ink fill, never the accent. */
  primary: `${BASE} bg-primary text-on-primary hover:bg-primary-hover`,
  /** Destructive confirm. */
  danger: `${BASE} bg-danger text-on-danger hover:bg-danger-hover`,
} as const;

const ICON_BASE =
  'flex size-control-sm flex-none items-center justify-center rounded-tile transition-colors hover-none:size-9 [&_svg]:h-4 [&_svg]:w-4';

/** Icon-only button on a plain surface. */
export const ICON_BUTTON = `${ICON_BASE} text-muted hover:bg-hover hover:text-ink`;
/** Icon-only button inside a row that already paints `hover:bg-hover`. */
export const ICON_BUTTON_ROW = `${ICON_BASE} text-muted hover:bg-track hover:text-ink`;
/** Destructive icon-only button inside a hovering row. */
export const ICON_BUTTON_DANGER = `${ICON_BASE} text-danger hover:bg-track`;