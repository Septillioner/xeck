import { useAppState } from '../state/AppState.tsx';
import { BotCreateDialog } from './BotCreateDialog.tsx';
import { BotProfileDialog } from './BotProfileDialog.tsx';

export function BotDialogs() {
  const { botCreateOpen, botProfileId } = useAppState();
  return <>{botCreateOpen && <BotCreateDialog />}{botProfileId && <BotProfileDialog key={botProfileId} id={botProfileId} />}</>;
}
