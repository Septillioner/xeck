import {
  ArrowRight,
  ImagePlus,
  Bookmark,
  Check,
  ChevronRight,
  Code,
  Copy,
  EllipsisVertical,
  Eye,
  EyeOff,
  FileText,
  Folder,
  LoaderCircle,
  MessageSquare,
  Menu,
  Minus,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Terminal,
  Sun,
  Trash2,
  TriangleAlert,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/cn.ts';

/* Every glyph except the brand mark comes from lucide-react (named imports, so
   the bundle only keeps what is listed here). One size and one stroke token. */
const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

type IconProps = { className?: string };

function icon(Glyph: LucideIcon) {
  return function Icon({ className }: IconProps) {
    return <Glyph size={ICON_SIZE} strokeWidth={ICON_STROKE} className={className} aria-hidden="true" />;
  };
}

const LOGO_PATH = 'M12 18H25L34 30L46 12H58L35 50H24L29 41Z M20 35L26 43L21 50H9Z';

export function IconXeck({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d={LOGO_PATH}
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * The busy spinner. `data-mood-busy` carries the mood name so the row can color
 * the icon from the mood token; a static class would have to restate every
 * mood, which is the cascade debt this migration is removing.
 */
export function IconBusy({ mood, className }: { mood?: string; className?: string }) {
  return (
    <LoaderCircle
      data-mood-busy={mood ?? 'true'}
      className={cn('h-[18px] w-[18px] flex-none text-muted motion-reduce:animate-none', className)}
      size={ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
    />
  );
}

export function IconSpinner({ className }: IconProps) {
  return (
    <LoaderCircle
      className={cn('flex-none animate-spin motion-reduce:animate-none', className)}
      size={ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
    />
  );
}

export const IconMenu = icon(Menu);
export const IconAddPhoto = icon(ImagePlus);
export const IconMoreVertical = icon(EllipsisVertical);
export const IconChat = icon(MessageSquare);
export const IconStar = icon(Star);
/** The Coder agent mark. */
export const IconCode = icon(Code);
export const IconChevron = icon(ChevronRight);
export const IconSearch = icon(Search);
export const IconSettings = icon(Settings);
export const IconSend = icon(ArrowRight);
export const IconEdit = icon(Pencil);
export const IconCopy = icon(Copy);
export const IconTrash = icon(Trash2);
export const IconPlay = icon(Play);
export const IconAlert = icon(TriangleAlert);
export const IconCheck = icon(Check);
export const IconEye = icon(Eye);
export const IconEyeOff = icon(EyeOff);
export const IconSpark = icon(Sparkles);
export const IconSun = icon(Sun);
export const IconMoon = icon(Moon);
export const IconMonitor = icon(Monitor);
export const IconSliders = icon(SlidersHorizontal);
export const IconPalette = icon(Palette);
export const IconWand = icon(WandSparkles);
export const IconPlus = icon(Plus);
export const IconFolder = icon(Folder);
export const IconMinimize = icon(Minus);
export const IconMaximize = icon(Square);
export const IconClose = icon(X);
export const IconMemory = icon(Bookmark);
export const IconFileText = icon(FileText);
export const IconServer = icon(Server);
export const IconTerminal = icon(Terminal);

export function IconStop({ className }: IconProps) {
  return <Square size={ICON_SIZE} strokeWidth={ICON_STROKE} fill="currentColor" className={className} aria-hidden="true" />;
}

export { ProviderMark } from './provider-icons.tsx';
