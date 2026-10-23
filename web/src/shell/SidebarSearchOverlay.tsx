import { useEffect, useRef, type RefObject } from 'react';
import { t } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { IconSearch } from '../ui/icons.tsx';
import { TextField } from '../ui/TextField.tsx';

export function SidebarSearchOverlay({
  query,
  buttonRef,
  onQuery,
  onClose,
  onOpen,
}: {
  query: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onQuery: (value: string) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { sessions } = useAppState();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const needle = query.trim().toLowerCase();
  const matches = sessions.filter((session) => session.title.toLowerCase().includes(needle));

  useEffect(() => {
    inputRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [buttonRef]);

  return (
    <div className="fixed inset-0 z-20 flex justify-center bg-scrim pt-[12vh]">
      <div className="h-fit w-[min(32rem,calc(100%-32px))] overflow-hidden rounded-card bg-chip" ref={panelRef}>
        <div className="flex h-12 items-center gap-2.5 px-3.5 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ink">
          <IconSearch className="h-[18px] w-[18px] flex-none text-muted" />
          <TextField bare
            ref={inputRef}
            value={query}
            placeholder={t('Search chats')}
            aria-label={t('Search chats')}
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-lead focus:outline-none"
            onChange={(event) => onQuery(event.target.value)}
          />
          <kbd className="flex-none rounded-full bg-field px-2 py-0.5 font-sans text-micro text-muted">{t('Esc')}</kbd>
        </div>
        <div className="max-h-[320px] overflow-auto p-1 [scrollbar-gutter:stable]">
          {matches.length === 0 ? (
            <p className="p-4 text-ui text-muted">{t('No chats')}</p>
          ) : (
            matches.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpen(session.id)}
                className="block w-full truncate rounded-control px-3 py-2 text-left text-body hover:bg-hover"
              >
                {session.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
