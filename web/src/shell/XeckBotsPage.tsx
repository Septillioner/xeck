import { t, useI18n } from '../i18n/index.ts';
import { useAppState } from '../state/AppState.tsx';
import { BUTTON } from '../ui/button-styles.ts';
import { BotAvatar } from '../ui/BotAvatar.tsx';

export function XeckBotsPage() {
  const { sessions, openChat, setBotCreateOpen } = useAppState();
  const { locale } = useI18n();
  const bots = sessions
    .filter((session) => session.bot && !session.botConversation && !session.archived && !session.parentId)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.title.localeCompare(b.title, locale));

  return (
    <section className="panel-shell flex min-w-0 flex-1 flex-col bg-main" aria-labelledby="xeckbot-title">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="column px-gutter py-8">
          <h1 id="xeckbot-title" className="display-title">XeckBot</h1>
          {bots.length === 0 ? (
            <div className="mt-6">
              <p className="max-w-prose text-lead text-muted">{t('Create your first XeckBot to get started.')}</p>
              <button type="button" className={BUTTON.primary + ' mt-5'} onClick={() => setBotCreateOpen(true)}>{t('XeckBot oluştur')}</button>
            </div>
          ) : (
            <ul className="mt-8 flex flex-col">
              {bots.map((bot) => {
                const badges = bot.bot?.badges ?? [];
                return (
                  <li key={bot.id}>
                    <button type="button" className="flex min-h-11 w-full items-start gap-3 rounded-control px-2 py-3 text-left hover:bg-hover" onClick={() => void openChat(bot.id)}>
                      <BotAvatar name={bot.title} color={bot.bot!.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lead font-medium">{bot.title}</span>
                        {bot.bot?.purpose && <span className="bot-purpose mt-1 text-ui text-muted">{bot.bot.purpose}</span>}
                        {badges.length > 0 && <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-small text-muted">{badges.map((badge) => <span key={badge}>{badge}</span>)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
