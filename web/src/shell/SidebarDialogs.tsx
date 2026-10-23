import { t } from '../i18n/index.ts';
import { BUTTON } from '../ui/button-styles.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { TextField } from '../ui/TextField.tsx';
import { MAX_PROJECT_NAME_CHARS } from '../../../shared/limits.ts';

export function SidebarDialogs({
  projectOpen,
  projectId,
  projectName,
  projectBusy,
  projectError,
  onProjectName,
  onCloseProject,
  onSaveProject,
  chatId,
  projectDeleteId,
  onCloseChatDelete,
  onCloseProjectDelete,
  onDeleteChat,
  onDeleteProject,
}: {
  projectOpen: boolean;
  projectId: string | null;
  projectName: string;
  projectBusy: boolean;
  projectError: string | null;
  onProjectName: (value: string) => void;
  onCloseProject: () => void;
  onSaveProject: () => void;
  chatId: string | null;
  projectDeleteId: string | null;
  onCloseChatDelete: () => void;
  onCloseProjectDelete: () => void;
  onDeleteChat: () => void;
  onDeleteProject: () => void;
}) {
  return (
    <>
      {projectOpen && (
        <Dialog
          title={projectId ? t('Rename project') : t('New project')}
          onClose={onCloseProject}
        >
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveProject();
            }}
          >
            <label className="flex flex-col gap-2 text-ui text-muted">
              {t('Project name')}<TextField
                autoFocus
                width="block"
                value={projectName}
                maxLength={MAX_PROJECT_NAME_CHARS}
                onChange={(event) => onProjectName(event.target.value)}
              />
            </label>
            {projectError && <p className="text-small text-danger" role="alert">{t(projectError)}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON.ghost} onClick={onCloseProject}>{t('Cancel')}</button>
              <button type="submit" className={BUTTON.primary} disabled={projectBusy}>
                {projectBusy ? t('Saving') : t('Save')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {chatId && (
        <Dialog title={t('Chatu sil')} onClose={onCloseChatDelete}>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-ui text-muted">{t('Bu chatı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON.ghost} onClick={onCloseChatDelete}>{t('İptal')}</button>
              <button type="button" data-primary className={BUTTON.danger} onClick={onDeleteChat}>{t('Sil')}</button>
            </div>
          </div>
        </Dialog>
      )}
      {projectDeleteId && (
        <Dialog title={t('Projeyi sil')} onClose={onCloseProjectDelete}>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-ui text-muted">{t('Bu projeyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON.ghost} onClick={onCloseProjectDelete}>{t('İptal')}</button>
              <button type="button" data-primary className={BUTTON.danger} onClick={onDeleteProject}>{t('Sil')}</button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
