import { useState, type FormEvent } from 'react';
import type { UserDialog } from '../../../../shared/types.ts';
import { TextField } from '../../ui/TextField.tsx';

export function InteractiveDialogCard({
  dialog,
  onRespond,
  answered = false,
  answer,
}: {
  dialog: UserDialog;
  onRespond?: (dialogId: string, response: { approved?: boolean; response?: string; selections?: string[]; other?: string }) => void;
  /** Past turns: the question stays visible in its chronological spot, but locked. */
  answered?: boolean;
  /** Answer line recorded when the dialog resolved, shown once locked. */
  answer?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [otherValue, setOtherValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async (response: { approved?: boolean; response?: string; selections?: string[]; other?: string }) => {
    if (submitting || !onRespond || answered) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onRespond(dialog.id, response);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not send');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuestionSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!inputVal.trim()) return;
    void submit({ response: inputVal.trim() });
  };

  const options = dialogOptions(dialog);
  const allowOther = dialog.details?.allowOther === true;
  const toggleOption = (option: string) => {
    setSelectedOptions((current) => current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option]);
  };

  return (
    <div className="interaction-card" role="region" aria-label={dialog.title} data-answered={answered ? 'true' : 'false'}>
      <h4 className="interaction-title">{dialog.title}</h4>
      <p className="interaction-prompt">{dialog.prompt}</p>

      {answered && (
        <p className="interaction-answered">
          {answer ? `Answered: ${answer}` : 'Unanswered — the turn ended here.'}
        </p>
      )}
      {errorMessage && <p className="interaction-error">{errorMessage}</p>}

      {dialog.type === 'approval' ? (
        <div className="interaction-actions">
          <button
            type="button"
            className="interaction-btn-primary"
            onClick={() => void submit({ approved: true })}
            disabled={submitting || answered}
          >
            {submitting ? 'Confirming' : 'Approve'}
          </button>
          <button
            type="button"
            className="interaction-btn-secondary"
            onClick={() => void submit({ approved: false })}
            disabled={submitting || answered}
          >
            Reject
          </button>
        </div>
      ) : dialog.type === 'yes_no' ? (
        <div className="interaction-actions">
          <button type="button" className="interaction-btn-primary" onClick={() => void submit({ response: 'yes' })} disabled={submitting || answered}>
            {submitting ? 'Sending' : 'Yes'}
          </button>
          <button type="button" className="interaction-btn-secondary" onClick={() => void submit({ response: 'no' })} disabled={submitting || answered}>
            No
          </button>
        </div>
      ) : dialog.type === 'multiple_select' ? (
        <form
          className="interaction-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (answered) return;
            if (selectedOptions.length === 0 && !(allowOther && otherValue.trim())) return;
            void submit({
              selections: selectedOptions,
              ...(otherValue.trim() ? { other: otherValue.trim() } : {}),
            });
          }}
        >
          <div className="interaction-options">
            {options.map((option) => (
              <label key={option} className="interaction-option">
                <input
                  type="checkbox"
                  checked={selectedOptions.includes(option)}
                  onChange={() => toggleOption(option)}
                  disabled={submitting || answered}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {allowOther && (
            <TextField
              width="block"
              value={otherValue}
              onChange={(event) => setOtherValue(event.target.value)}
              placeholder="Other"
              aria-label="Other answer"
              disabled={submitting || answered}
            />
          )}
          <div className="interaction-actions">
            <button type="submit" className="interaction-btn-primary" disabled={submitting || answered || (selectedOptions.length === 0 && !(allowOther && otherValue.trim()))}>
              {submitting ? 'Sending' : 'Submit'}
            </button>
            <button type="button" className="interaction-btn-secondary" onClick={() => void submit({})} disabled={submitting || answered}>
              Dismiss
            </button>
          </div>
        </form>
      ) : (
        <form className="interaction-form" onSubmit={handleQuestionSubmit}>
          <TextField
            width="block"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Type your response..."
            autoFocus
            disabled={submitting || answered}
          />
          <div className="interaction-actions">
            <button
              type="submit"
              className="interaction-btn-primary"
              disabled={submitting || answered || !inputVal.trim()}
            >
              {submitting ? 'Sending' : 'Send response'}
            </button>
            <button
              type="button"
              className="interaction-btn-secondary"
              onClick={() => void submit({ approved: false })}
              disabled={submitting || answered}
            >
              Dismiss
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
export function dialogOptions(dialog: UserDialog): string[] {
  const options = dialog.details?.options;
  return Array.isArray(options) ? options.filter((option): option is string => typeof option === 'string') : [];
}
