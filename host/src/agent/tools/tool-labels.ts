import { isBuiltinHostTool, serverSideName } from './builtin/identity.ts';
import { registeredBuiltinNames } from './builtin/registry.ts';
import type { ToolLabelShape } from '@@core/definitions/toolset.ts';

export interface ToolLabel extends ToolLabelShape {
  requires?: ('user' | 'plan-owner')[];
  availableWhen?: 'fullFileAccess';
}

/**
 * Tool etiket overlay'i: onay gerektiren tool'lar (`requires`) ve bayrakla
 * kapananlar (`availableWhen`). İzin kararı policy'nin explicit allow/deny
 * listesinden gelir; bu dosya `user` onayı ve `fullFileAccess` bayrağını tutar.
 *
 * Fail-closed SADECE builtin'e uygulanır: host'un tanımladığı tool etiketsizse
 * listeye girmez. Kayıtlı her builtin etiket alır. Harici MCP + `load_skill`
 * etiketsiz = açık, policy `deny` ile kapatılabilir.
 */

const REQUIRES_OF: Record<string, ('user' | 'plan-owner')[]> = {
  list_message_targets: ['user'],
  send_chat_message: ['user'],
  create_xeckbot: ['user'],
  delete_file: ['user'],
  ask_question: ['user'],
  enable_mcp: ['user'],
  plan_write: ['plan-owner'],
};

/** Kütüphane-içi tool: builtin ad alanında değil, koşullu listelenir. */
export const LOAD_SKILL_LABEL: ToolLabel = { name: 'load_skill' };

let builtinLabels: Record<string, ToolLabel> | null = null;

/** Kayıtlı her builtin için etiket. İzin burada değildir. İlk okumada kurulur. */
function builtinToolLabels(): Record<string, ToolLabel> {
  if (builtinLabels) return builtinLabels;
  builtinLabels = Object.fromEntries(
    registeredBuiltinNames().map((name) => [
      name,
      {
        name,
        ...(REQUIRES_OF[name] ? { requires: REQUIRES_OF[name] } : {}),
        ...(name === 'run_command' || name === 'grep' ? { availableWhen: 'fullFileAccess' as const } : {}),
      },
    ]),
  );
  return builtinLabels;
}

/** Modelin gördüğü adı etikete çevirir (`mcp_xeck__` öneki sıyrılır). */
export function getToolLabel(toolName: string): ToolLabel | undefined {
  if (toolName === LOAD_SKILL_LABEL.name) return LOAD_SKILL_LABEL;
  if (!isBuiltinHostTool(toolName)) return undefined;
  return builtinToolLabels()[serverSideName(toolName)];
}

/** Fail-closed denetimi: builtin olup etiketsiz kalan tool. */
export function isUnlabeledBuiltin(toolName: string): boolean {
  return isBuiltinHostTool(toolName) && !builtinToolLabels()[serverSideName(toolName)];
}
