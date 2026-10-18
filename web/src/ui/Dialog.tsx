import { t } from '../i18n/index.ts';
import { useEffect, useId, useRef, useLayoutEffect, type ReactNode } from 'react';
import { IconClose } from './icons.tsx';
import { hasOpenMenu } from './open-menu.ts';

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // An open menu inside the dialog owns Escape first: it closes the menu and
      // leaves the dialog open. The marker is a data attribute, not a class, so
      // restyling a menu can never change this behavior.
      if (hasOpenMenu(panelRef.current)) return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const primary = panel.querySelector<HTMLButtonElement>('[data-primary]');
    if (primary) {
      primary.focus();
      return;
    }
    const firstFocusable = panel.querySelector<HTMLButtonElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
  }, []);

  return (
    <div className="modal-layer">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <header className="modal-header">
          <h3 id={titleId}>{t(title)}</h3>
          <button type="button" className="icon-button" aria-label={t("Close")} onClick={onClose}>
            <IconClose />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
