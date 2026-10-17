import { useEffect, useRef, useState, type ComponentProps, type HTMLAttributes } from 'react';
import { ICON_BUTTON } from './button-styles.ts';
import { IconEdit } from './icons.tsx';
import { TextField } from './TextField.tsx';

/* A value that reads as text and becomes a TextField on click or on the pencil.
   Enter or blur commits (only when the text changed), Escape cancels. The read state is a
   <button>, so it is reachable and activatable from the keyboard; focus returns to it after
   Enter or Escape. `display` replaces the shown text (a masked key), `placeholder` shows
   when there is nothing to show. */
export function EditableField({
  value,
  display,
  placeholder = 'Not set',
  label,
  type = 'text',
  inputMode,
  min,
  max,
  step,
  disabled = false,
  onCommit,
}: {
  value: string;
  display?: string;
  placeholder?: string;
  label: string;
  type?: 'text' | 'password' | 'number';
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  min?: ComponentProps<'input'>['min'];
  max?: ComponentProps<'input'>['max'];
  step?: ComponentProps<'input'>['step'];
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const closed = useRef(true);
  const refocus = useRef(false);
  const readRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    readRef.current?.focus();
  }, [editing]);

  const start = () => {
    if (disabled) return;
    closed.current = false;
    setDraft(value);
    setEditing(true);
  };
  const finish = (save: boolean, byKey: boolean) => {
    if (closed.current) return;
    closed.current = true;
    refocus.current = byKey;
    setEditing(false);
    if (save && draft !== value) onCommit(draft);
  };

  if (editing) {
    return (
      <span className="editable">
        <TextField
          autoFocus
          width="block"
          type={type}
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          autoComplete="off"
          value={draft}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true, false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish(true, true);
            } else if (event.key === 'Escape') {
              event.stopPropagation();
              finish(false, true);
            }
          }}
        />
      </span>
    );
  }

  const shown = display ?? value;
  return (
    <span className="editable">
      <button
        ref={readRef}
        type="button"
        className="editable-value"
        data-empty={shown ? 'false' : 'true'}
        disabled={disabled}
        aria-label={`Edit ${label}`}
        onClick={start}
      >
        {shown || placeholder}
      </button>
      <button type="button" className={ICON_BUTTON} tabIndex={-1} disabled={disabled} aria-label={`Edit ${label}`} onClick={start}>
        <IconEdit />
      </button>
    </span>
  );
}
