import { t, getLocale } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { MEMORY_TYPES, type MemoryRecord, type MemoryType, type MemoryWrite } from '../../../shared/types.ts';
import { listMemories, putMemories } from '../api/client.ts';
import { IconEdit, IconPlus, IconSpinner, IconTrash } from '../ui/icons.tsx';
import { Menu } from '../ui/Menu.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { SettingCard, SettingRow } from '../ui/SettingRow.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { TextField } from '../ui/TextField.tsx';

const TYPE_LABELS: Record<MemoryType, string> = {
  memory: 'Memory',
  rule: 'Rule',
  decision: 'Decision',
  context: 'Context',
};

const TYPE_OPTIONS = MEMORY_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

interface MemoryDraft {
  id?: string;
  title: string;
  content: string;
  type: MemoryType;
  tags: string;
  source?: MemoryRecord['source'];
}

export function MemoriesSettings() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listMemories()
      .then(setMemories)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not load memories")))
      .finally(() => setLoading(false));
  }, []);

  const save = (next: MemoryWrite[]) => {
    setNotice(null);
    void putMemories(next)
      .then(setMemories)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not save memories")));
  };

  const openEditor = (memory: MemoryRecord | null) => {
    setDraft(memory ? draftFromMemory(memory) : emptyDraft());
    setEditorOpen(true);
  };

  return (
    <div className="stack">
      <div className="section-header">
        <div>
          <h2>{t("Memories")}</h2>
          <p className="lede">{t("Saved notes stay out of the prompt until a tool reads them.")}</p>
        </div>
        <button type="button" className="text-button with-icon" onClick={() => openEditor(null)}>
          <IconPlus />
          {t("New memory")}</button>
      </div>
      <SettingCard>
        {loading ? (
          <div className="flex min-h-20 items-center justify-center gap-2 py-4 text-ui text-muted" role="status" aria-live="polite">
            <IconSpinner />
            <span>{t("Loading memories…")}</span>
          </div>
        ) : memories.length === 0 ? (
          <p className="catalog-empty">{t("No memories yet")}</p>
        ) : (
          memories.map((memory) => (
            <div className="rule-item" key={memory.id}>
              <div className="setting-row">
                <div className="memory-copy">
                  <span className="rule-preview">{memory.title}</span>
                  <span className="row-detail">{memoryMeta(memory)}</span>
                </div>
                <span className="row-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={expanded.has(memory.id)}
                    onClick={() => setExpanded((current) => toggleExpanded(current, memory.id))}
                  >
                    {expanded.has(memory.id) ? t("Hide") : t("View")}
                  </button>
                  <button type="button" className="icon-button" aria-label={t("Edit {0}", { "0": memory.title })} onClick={() => openEditor(memory)}>
                    <IconEdit />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={t("Remove {0}", { "0": memory.title })}
                    onClick={() => {
                      setExpanded((current) => {
                        const next = new Set(current);
                        next.delete(memory.id);
                        return next;
                      });
                      save(memories.filter((item) => item.id !== memory.id).map(toWrite));
                    }}
                  >
                    <IconTrash />
                  </button>
                </span>
              </div>
              {expanded.has(memory.id) && <div className="rule-text">{memory.content}</div>}
            </div>
          ))
        )}
      </SettingCard>
      {editorOpen && (
        <MemoryModal
          draft={draft}
          editing={Boolean(draft.id)}
          onChange={setDraft}
          onClose={() => setEditorOpen(false)}
          onSave={() => {
            const next = toWrite(draft);
            setEditorOpen(false);
            const withoutCurrent = memories.filter((memory) => memory.id !== draft.id);
            save([...withoutCurrent.map(toWrite), next]);
          }}
        />
      )}
      {notice && <p className="lede">{t(notice)}</p>}
    </div>
  );
}

function MemoryModal({
  draft,
  editing,
  onChange,
  onClose,
  onSave,
}: {
  draft: MemoryDraft;
  editing: boolean;
  onChange: (draft: MemoryDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ready = draft.title.trim().length > 0 && draft.content.trim().length > 0;
  return (
    <Dialog title={editing ? t("Edit memory") : t("New memory")} onClose={onClose}>
      <SettingRow label={t("Title")}>
        <TextField
          autoFocus
          width="wide"
          value={draft.title}
          aria-label={t("Memory title")}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </SettingRow>
      <SettingRow label={t("Type")}>
        <Menu
          label={t("Memory type")}
          value={draft.type}
          options={TYPE_OPTIONS}
          onChange={(type) => onChange({ ...draft, type: type as MemoryType })}
        />
      </SettingRow>
      <SettingRow label={t("Tags")}>
        <TextField
          width="wide"
          value={draft.tags}
          aria-label={t("Memory tags")}
          placeholder={t("Comma separated")}
          onChange={(event) => onChange({ ...draft, tags: event.target.value })}
        />
      </SettingRow>
      <div className="form-pad">
        <p className="setting-label">{t("Content")}</p>
        <Textarea
          value={draft.content}
          aria-label={t("Memory content")}
          onChange={(event) => onChange({ ...draft, content: event.target.value })}
        />
      </div>
      <footer className="modal-footer">
        <button type="button" onClick={onClose}>
          {t("Cancel")}</button>
        <button type="button" disabled={!ready} onClick={onSave}>
          {editing ? t("Save memory") : t("Add memory")}
        </button>
      </footer>
    </Dialog>
  );
}

function emptyDraft(): MemoryDraft {
  return { title: '', content: '', type: 'memory', tags: '' };
}

function draftFromMemory(memory: MemoryRecord): MemoryDraft {
  return {
    id: memory.id,
    title: memory.title,
    content: memory.content,
    type: memory.type,
    tags: memory.tags.join(', '),
    source: memory.source,
  };
}

function toWrite(memory: MemoryRecord | MemoryDraft): MemoryWrite {
  return {
    id: memory.id,
    title: memory.title,
    content: memory.content,
    type: memory.type,
    tags: Array.isArray(memory.tags) ? memory.tags : splitTags(memory.tags),
    source: memory.source ?? 'user',
  };
}

function splitTags(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function memoryMeta(memory: MemoryRecord): string {
  const tags = memory.tags.length > 0 ? memory.tags.join(', ') : t('No tags');
  const source = memory.source === 'xeck' ? 'Xeck' : 'User';
  return `${t(TYPE_LABELS[memory.type])} · ${t(source)} · ${tags} · ${formatUpdated(memory.updatedAt)}`;
}

function formatUpdated(value: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
}

function toggleExpanded(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
