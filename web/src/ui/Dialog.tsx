import { t } from '../i18n/index.ts';
import { useEffect, useId, useRef, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons.tsx';
import { hasOpenMenu } from './open-menu.ts';

export function Dialog({
  title,
  onClose,
  showCloseButton = true,
  children,
}: {
  title: string;
  onClose: () => void;
  showCloseButton?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef(document.activeElement as HTMLElement | null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== panelRef.current) return;
      if ((event.target as Element).closest('[data-dialog-popover]')) return;
      if (panelRef.current?.contains(event.target as Node)) return;
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || [...document.querySelectorAll('[role="dialog"]')].at(-1) !== panel) return;
      if (event.key === 'Tab') {
        if (hasOpenMenu(panel)) return;
        const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter((item) => item.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); panel.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key !== 'Escape') return;
      // An open menu inside the dialog owns Escape first: it closes the menu and
      // leaves the dialog open. The marker is a data attribute, not a class, so
      // restyling a menu can never change this behavior.
      if (hasOpenMenu(panelRef.current)) return;
      event.stopPropagation();
      onCloseRef.current();
    };
    const onFocus = (event: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel || [...document.querySelectorAll('[role="dialog"]')].at(-1) !== panel) return;
      if (panel.contains(event.target as Node) || (event.target as Element).closest('[data-dialog-popover]')) return;
      const control = panel.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled)') ?? panel.querySelector<HTMLElement>('button:not(:disabled)');
      (control ?? panel).focus();
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      const trigger = returnFocusRef.current;
      const panel = panelRef.current;
      queueMicrotask(() => { if (!panel?.isConnected && trigger?.isConnected) trigger.focus({ preventScroll: true }); });
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
    const firstFocusable = panel.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') ?? panel.querySelector<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
  }, []);

  return createPortal(
    <div className="modal-layer">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <header className="modal-header">
          <h3 id={titleId}>{t(title)}</h3>
          {showCloseButton && <button type="button" className="icon-button" aria-label={t("Close")} onClick={onClose}>
            <IconClose />
          </button>}
        </header>
        {children}
      </div>
    </div>, document.body
  );
}
