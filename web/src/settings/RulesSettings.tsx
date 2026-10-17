import { useEffect, useState } from 'react';
import type { RuleRecord } from '../../../shared/types.ts';
import { listRules, putRules } from '../api/client.ts';
import { IconEdit, IconPlus, IconSpinner, IconTrash } from '../ui/icons.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { SettingCard } from '../ui/SettingRow.tsx';
import { Textarea } from '../ui/Textarea.tsx';

export function RulesSettings() {
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [text, setText] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [expandedRules, setExpandedRules] = useState<Set<number>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listRules()
      .then(setRules)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load rules'))
      .finally(() => setLoading(false));
  }, []);

  const save = (next: RuleRecord[]) => {
    setNotice(null);
    void putRules(next)
      .then(setRules)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not save rules'));
  };

  const openEditor = (index: number | null) => {
    setEditingIndex(index);
    setText(index === null ? '' : rules[index]?.text ?? '');
    setEditorOpen(true);
  };

  return (
    <div className="stack">
      <div className="section-header">
        <div>
          <h2>Rules</h2>
          <p className="lede">Each rule is added to the system message.</p>
        </div>
        <button
          type="button"
          className="text-button with-icon"
          onClick={() => openEditor(null)}
        >
          <IconPlus />
          New rule
        </button>
      </div>
      <SettingCard>
        {loading ? (
          <div className="flex min-h-20 items-center justify-center gap-2 py-4 text-ui text-muted" role="status" aria-live="polite">
            <IconSpinner />
            <span>Loading rules…</span>
          </div>
        ) : rules.length === 0 ? (
          <p className="catalog-empty">No rules yet</p>
        ) : (
          rules.map((rule, index) => (
            <div className="rule-item" key={`${index}-${rule}`}>
              <div className="setting-row">
                <div className="memory-copy">
                  <span className="rule-preview">{rule.text.split(/\r?\n/, 1)[0]}</span>
                  <span className="row-detail">{rule.source === 'xeck' ? 'Xeck' : 'User'}</span>
                </div>
                <span className="row-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={expandedRules.has(index)}
                    onClick={() => setExpandedRules((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })}
                  >
                    {expandedRules.has(index) ? 'Hide' : 'View'}
                  </button>
                  <button type="button" className="icon-button" aria-label={`Edit rule ${index + 1}`} onClick={() => openEditor(index)}>
                    <IconEdit />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove rule ${index + 1}`}
                    onClick={() => {
                      setExpandedRules((current) => new Set(
                        [...current]
                          .filter((expandedIndex) => expandedIndex !== index)
                          .map((expandedIndex) => expandedIndex > index ? expandedIndex - 1 : expandedIndex),
                      ));
                      save(rules.filter((_, ruleIndex) => ruleIndex !== index));
                    }}
                  >
                    <IconTrash />
                  </button>
                </span>
              </div>
              {expandedRules.has(index) && <div className="rule-text">{rule.text}</div>}
            </div>
          ))
        )}
      </SettingCard>
      {editorOpen && (
        <RuleModal
          text={text}
          editing={editingIndex !== null}
          onChange={setText}
          onClose={() => {
            setEditorOpen(false);
            setEditingIndex(null);
          }}
          onSave={() => {
            const next = text.trim();
            if (!next) return;
            setText('');
            setEditorOpen(false);
            if (editingIndex === null) {
              save([...rules, { text: next, source: 'user' }]);
            } else {
              save(rules.map((rule, index) => index === editingIndex ? { ...rule, text: next } : rule));
            }
            setEditingIndex(null);
          }}
        />
      )}
      {notice && <p className="lede">{notice}</p>}
    </div>
  );
}

function RuleModal({
  text,
  editing,
  onChange,
  onClose,
  onSave,
}: {
  text: string;
  editing: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog title={editing ? 'Edit rule' : 'New rule'} onClose={onClose}>
      <div className="form-pad">
        <p className="setting-label">Rule</p>
        <Textarea
          autoFocus
          value={text}
          placeholder={editing ? 'Edit rule' : 'Add a rule'}
          aria-label={editing ? 'Edit rule' : 'Add a rule'}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <footer className="modal-footer">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" disabled={!text.trim()} onClick={onSave}>
          {editing ? 'Save rule' : 'Add rule'}
        </button>
      </footer>
    </Dialog>
  );
}
