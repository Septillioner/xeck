import { type ReactNode } from 'react';
import type { CustomizeTab } from '../../../shared/types.ts';
import { IconFileText, IconMemory, IconServer, IconSpark } from '../ui/icons.tsx';
import { useAppState } from '../state/AppState.tsx';
import { McpSettings } from './mcp/McpSettings.tsx';
import { MemoriesSettings } from './MemoriesSettings.tsx';
import { RulesSettings } from './RulesSettings.tsx';
import { SkillsSettings } from './SkillsSettings.tsx';
import { AgentSettings } from './AgentSettings.tsx';

const TAB_LABELS: Record<CustomizeTab, string> = {
  skills: 'Skills',
  rules: 'Rules',
  memories: 'Memories',
  mcp: 'MCPs',
};

export function CustomizeSettings({ initialTab = 'skills' }: { initialTab?: CustomizeTab }) {
  const { openSettings } = useAppState();
  const tab = initialTab;

  return (
    <div className="stack">
      <AgentSettings />
      <section className="stack" aria-label="Customize sections">
        <div className="customize-tabs" role="tablist" aria-label="Customize sections">
          <TabButton tab="skills" active={tab} onSelect={openSettings} icon={<IconSpark />} />
          <TabButton tab="rules" active={tab} onSelect={openSettings} icon={<IconFileText />} />
          <TabButton tab="memories" active={tab} onSelect={openSettings} icon={<IconMemory />} />
          <TabButton tab="mcp" active={tab} onSelect={openSettings} icon={<IconServer />} />
        </div>
        {tab === 'skills' && <SkillsSettings />}
        {tab === 'rules' && <RulesSettings />}
        {tab === 'memories' && <MemoriesSettings />}
        {tab === 'mcp' && <McpSettings />}
      </section>
    </div>
  );
}

function TabButton({
  tab,
  active,
  onSelect,
  icon,
}: {
  tab: CustomizeTab;
  active: CustomizeTab;
  onSelect: (tab: CustomizeTab) => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" role="tab" aria-selected={active === tab} data-active={active === tab ? 'true' : 'false'} onClick={() => onSelect(tab)}>
      {icon}
      {TAB_LABELS[tab]}
    </button>
  );
}
