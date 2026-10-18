import { t } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import type { SkillRecord } from '../../../shared/types.ts';
import { listSkills, putSkills } from '../api/client.ts';
import { IconEdit, IconPlus, IconSpinner, IconTrash } from '../ui/icons.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { parseSkillFile } from './skill-file.ts';
import { SettingCard, SettingRow } from '../ui/SettingRow.tsx';
import { Textarea } from '../ui/Textarea.tsx';
import { TextField } from '../ui/TextField.tsx';

const SKILL_SOURCES = ['form', 'file'] as const;
type SkillSource = (typeof SKILL_SOURCES)[number];
const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  form: 'Form',
  file: 'Skill file',
};

const EMPTY_SKILL = { name: '', description: '', content: '' };

export function SkillsSettings() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [draft, setDraft] = useState(EMPTY_SKILL);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listSkills()
      .then(setSkills)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not load skills")))
      .finally(() => setLoading(false));
  }, []);

  const save = (next: SkillRecord[]) => {
    setNotice(null);
    void putSkills(next)
      .then(setSkills)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not save skills")));
  };

  const openEditor = (skill: SkillRecord | null) => {
    setEditingName(skill?.name ?? null);
    setDraft(skill ?? EMPTY_SKILL);
    setEditorOpen(true);
  };

  return (
    <div className="stack">
      <div className="section-header">
        <div>
          <h2>{t("Skills")}</h2>
          <p className="lede">{t("The model loads a skill body only when it asks for that name.")}</p>
        </div>
        <button type="button" className="text-button with-icon" onClick={() => openEditor(null)}>
          <IconPlus />
          {t("New skill")}</button>
      </div>
      <SettingCard>
        {loading ? (
          <div className="flex min-h-20 items-center justify-center gap-2 py-4 text-ui text-muted" role="status" aria-live="polite">
            <IconSpinner />
            <span>{t("Loading skills…")}</span>
          </div>
        ) : skills.length === 0 ? (
          <p className="catalog-empty">{t("No skills yet")}</p>
        ) : (
          skills.map((skill) => (
            <div className="setting-row" key={skill.name}>
              <div className="catalog-copy">
                <strong>{skill.name}</strong>
                <span className="row-detail">{skill.description}</span>
              </div>
              <span className="row-actions">
                <button type="button" className="icon-button" aria-label={t("Edit {0}", { "0": skill.name })} onClick={() => openEditor(skill)}>
                  <IconEdit />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={t("Remove {0}", { "0": skill.name })}
                  onClick={() => {
                    if (editingName === skill.name) {
                      setEditingName(null);
                      setDraft(EMPTY_SKILL);
                      setEditorOpen(false);
                    }
                    save(skills.filter((item) => item.name !== skill.name));
                  }}
                >
                  <IconTrash />
                </button>
              </span>
            </div>
          ))
        )}
      </SettingCard>
      {editorOpen && (
        <SkillModal
          draft={draft}
          editing={editingName !== null}
          onChange={setDraft}
          onClose={() => setEditorOpen(false)}
          onSave={(next) => {
            save([...skills.filter((item) => item.name !== next.name && item.name !== editingName), next]);
            setEditorOpen(false);
            setEditingName(null);
            setDraft(EMPTY_SKILL);
          }}
        />
      )}
      {notice && <p className="lede">{t(notice)}</p>}
    </div>
  );
}

function SkillModal({
  draft,
  editing,
  onChange,
  onClose,
  onSave,
}: {
  draft: SkillRecord;
  editing: boolean;
  onChange: (draft: SkillRecord) => void;
  onClose: () => void;
  onSave: (skill: SkillRecord) => void;
}) {
  const [source, setSource] = useState<SkillSource>('form');
  const [fileText, setFileText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const formReady = Boolean(draft.name.trim() && draft.description.trim() && draft.content.trim());
  const fileReady = Boolean(fileText.trim());
  const showFile = !editing && source === 'file';

  const save = () => {
    if (showFile) {
      const parsed = parseSkillFile(fileText);
      if ('error' in parsed) {
        setFileError(parsed.error);
        return;
      }
      onSave(parsed.skill);
      return;
    }
    const next = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      content: draft.content.trim(),
    };
    if (!next.name || !next.description || !next.content) return;
    onSave(next);
  };

  return (
    <Dialog title={editing ? t("Edit skill") : t("New skill")} onClose={onClose}>
      {!editing && (
        <div className="form-pad">
          <div className="segment" role="group" aria-label={t("Skill source")}>
            {SKILL_SOURCES.map((item) => (
              <button
                key={item}
                type="button"
                data-active={source === item ? 'true' : 'false'}
                onClick={() => setSource(item)}
              >
                {t(SKILL_SOURCE_LABELS[item])}
              </button>
            ))}
          </div>
        </div>
      )}
      {showFile ? (
        <div className="form-pad">
          <p className="setting-label">{t("Skill file")}</p>
          <Textarea
            autoFocus
            minRows={10}
            value={fileText}
            placeholder={t("Paste a skill file")}
            aria-label={t("Skill file")}
            onChange={(event) => {
              setFileText(event.target.value);
              setFileError(null);
            }}
          />
          {fileError && <p className="lede">{fileError}</p>}
        </div>
      ) : (
        <>
          <SettingRow label={t("Name")}>
            <TextField
              autoFocus
              width="wide"
              value={draft.name}
              aria-label={t("Skill name")}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("Description")}>
            <TextField
              width="wide"
              value={draft.description}
              aria-label={t("Skill description")}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </SettingRow>
          <div className="form-pad">
            <p className="setting-label">{t("Instructions")}</p>
            <Textarea
              value={draft.content}
              placeholder={t("Instructions")}
              aria-label={t("Skill instructions")}
              onChange={(event) => onChange({ ...draft, content: event.target.value })}
            />
          </div>
        </>
      )}
      <footer className="modal-footer">
        <button type="button" onClick={onClose}>
          {t("Cancel")}</button>
        <button type="button" disabled={showFile ? !fileReady : !formReady} onClick={save}>
          {editing ? t("Save skill") : t("Add skill")}
        </button>
      </footer>
    </Dialog>
  );
}
