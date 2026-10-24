import { t } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { IconXeck } from '../ui/icons.tsx';

export function XeckBotsPage() {
  const { sessions, setSidebarOpen } = useAppState();
  const hasBots = sessions.some((session) => session.bot && !session.botConversation && !session.archived);
  return <section className="panel-shell flex min-w-0 flex-1 items-center justify-center bg-main px-gutter" aria-labelledby="xeckbot-title">
    <div className="max-w-sm text-center">
      <IconXeck size={28} className="mx-auto mb-4 text-muted" />
      <h1 id="xeckbot-title" className="text-large font-medium">XeckBot</h1>
      <p className="mt-2 text-body leading-relaxed text-muted">{t(hasBots ? 'Choose a bot from the sidebar to continue.' : 'Create a XeckBot from the sidebar. Give it a name and a purpose.')}</p>
      <button type="button" className={BUTTON.secondary + ' mt-5 lg:hidden'} onClick={() => setSidebarOpen(true)}>{t('Open bot list')}</button>
    </div>
  </section>;
}
