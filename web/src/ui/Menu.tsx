import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { IconCheck, IconSearch } from './icons.tsx';
import { MENU_MARKER } from './open-menu.ts';
import { TextField } from './TextField.tsx';

export interface MenuOption {
  value: string;
  label: string;
  subtitle?: string;
  group?: string;
  tone?: string;
  icon?: ReactNode;
}

export interface MenuFooterAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

interface MenuProps {
  label: string;
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  onEmpty?: () => void;
  variant?: 'model' | 'field';
  buttonClass?: string;
  placement?: 'bottom' | 'top';
  detail?: string;
  rail?: ReactNode;
  showList?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  footerAction?: MenuFooterAction;
}

export function Menu({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  onEmpty,
  variant = 'field',
  buttonClass,
  placement = 'bottom',
  detail,
  rail,
  showList = true,
  onOpenChange,
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Search',
  footerAction,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const listId = useId();
  onOpenChangeRef.current = onOpenChange;
  const current = options.find((option) => option.value === value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);

  useEffect(() => {
    onOpenChangeRef.current?.(open);
    if (!open) {
      setQuery('');
      setFocusIndex(0);
      return;
    }
    if (showList) inputRef.current?.focus();
  }, [open, showList]);

  useEffect(() => {
    setFocusIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === 'Enter') {
      const next = filtered[focusIndex];
      if (!next) return;
      event.preventDefault();
      choose(next.value);
    }
  };

  const menuClass = variant === 'model' ? 'menu model' : 'menu';
  const triggerClass = buttonClass ?? (variant === 'model' ? 'model-pill' : 'field field-wide');
  const list = (
        <div className="menu-list bg-popover" id={listId} role="listbox" aria-label={label}>
          {searchable && (
            <div className="menu-search">
              <IconSearch />
              <TextField bare
                ref={inputRef}
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKey}
              />
            </div>
          )}
          <div className={searchable ? 'menu-scroll' : undefined}>
            {filtered.length === 0 && options.length > 0 && <p className="menu-empty">No models found</p>}
            {renderGroups(filtered, value, focusIndex, choose, setFocusIndex)}
            {options.length === 0 && emptyLabel && (
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  onEmpty?.();
                }}
              >
                {emptyLabel}
              </button>
            )}
          </div>
          {footerAction && (
            <button
              type="button"
              className="menu-footer"
              onClick={() => {
                setOpen(false);
                footerAction.onClick();
              }}
            >
              {footerAction.icon}
              <span>{footerAction.label}</span>
            </button>
          )}
        </div>
  );
  return (
    <div className={menuClass} {...{ [MENU_MARKER]: '' }} data-open={open ? 'true' : 'false'} data-placement={placement} ref={rootRef}>
      <button
        type="button"
        className={triggerClass}
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        {variant !== 'model' && current?.icon}
        <span>{current?.label ?? placeholder ?? label}</span>
        {detail && <span className="model-effort">{detail}</span>}
        <i className="chevron" />
      </button>
      {open &&
        (variant === 'model' ? (
          <div className="menu-popover">
            {rail}
            {showList && list}
          </div>
        ) : (
          list
        ))}
    </div>
  );
}

function filterOptions(options: MenuOption[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    [option.label, option.subtitle, option.group].some((part) => part?.toLowerCase().includes(needle)),
  );
}

function renderGroups(
  options: MenuOption[],
  value: string,
  focusIndex: number,
  choose: (value: string) => void,
  onHover: (index: number) => void,
) {
  const groups = new Map<string, MenuOption[]>();
  for (const option of options) {
    const key = option.group ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(option);
    else groups.set(key, [option]);
  }

  let flat = 0;
  return [...groups.entries()].map(([title, items]) => (
    <div key={title || 'ungrouped'}>
      {title && <p className="menu-group-title">{title}</p>}
      {items.map((option) => {
        const index = flat;
        flat += 1;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            className="menu-item"
            data-active={option.value === value ? 'true' : 'false'}
            data-tone={option.tone}
            data-focused={index === focusIndex ? 'true' : 'false'}
            onMouseEnter={() => onHover(index)}
            onClick={() => choose(option.value)}
          >
            {option.icon}
            <span className="menu-item-copy">
              <span className="menu-item-title">{option.label}</span>
              {option.subtitle && option.subtitle !== option.label && (
                <span className="menu-item-subtitle">{option.subtitle}</span>
              )}
            </span>
            {option.value === value && (
              <span className="menu-check">
                <IconCheck />
              </span>
            )}
          </button>
        );
      })}
    </div>
  ));
}
