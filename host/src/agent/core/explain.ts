import {
  allowSelectsTool,
  type AllowSelector,
  type ToolLabelShape,
} from '@@core/definitions/index.ts';

/**
 * Tek `explain()`: efektif kümenin derlenmiş hali ve ret nedenleri buradan gelir.
 * Köprü (`blocksToolInMode`), model-reddi (`deniedToolReason` üretimi) ve Debug
 * paneli Faz-1'de aynı fonksiyonu kullanır. Faz-0: saf fonksiyon, çağranı yok.
 *
 * Katman sırası: unlabeled → availability → toolset → policy →
 * capability → availableWhen.
 */

export type DeniedBy =
  | 'availability'
  | 'toolset'
  | 'policy'
  | 'capability'
  | 'unlabeled';

export interface ExplainResult {
  allowed: boolean;
  deniedBy?: DeniedBy;
  reason: string;
}

export interface ExplainContext {
  /** Modelin gördüğü ad, örn. `mcp_xeck__read_file` ya da `load_skill`. */
  toolName: string;
  /** Sunucu tarafı ad, örn. `read_file`. */
  serverSideName: string;
  isBuiltin: boolean;
  isSkillTool?: boolean;
  /** Builtin + etiketsiz = fail-closed. Harici etiketsiz = açık. */
  label?: ToolLabelShape;
  /** `refreshMcp()` çıktısında var mı (builtinEnabled ∩ server.enabled)? */
  available: boolean;
  /** Workspace `toolset` seçicisinde var mı? */
  inToolset: boolean;
  /** Policy izni (explicit allow + deny). */
  allow: AllowSelector;
  deny?: readonly string[];
  /** Chat'in karşı tarafça sağlanan yetenekleri (`user`, `plan-owner`). */
  capabilities?: readonly string[];
  fullFileAccess?: boolean;
}

export function explainTool(ctx: ExplainContext): ExplainResult {
  if (ctx.isBuiltin && !ctx.label) {
    return {
      allowed: false,
      deniedBy: 'unlabeled',
      reason: `Tool '${ctx.toolName}' has no domain/access label and is fail-closed.`,
    };
  }
  if (!ctx.available) {
    return {
      allowed: false,
      deniedBy: 'availability',
      reason: `Tool '${ctx.toolName}' is not available (builtin disabled, server off, or flag-gated).`,
    };
  }
  if (!ctx.inToolset) {
    return {
      allowed: false,
      deniedBy: 'toolset',
      reason: `Tool '${ctx.toolName}' is outside the workspace toolset.`,
    };
  }
  if (ctx.label) {
    const selection = allowSelectsTool(
      ctx.allow,
      ctx.deny ?? [],
      {
        serverSideName: ctx.serverSideName,
        isBuiltin: ctx.isBuiltin,
        isSkillTool: ctx.isSkillTool ?? false,
      },
      ctx.toolName,
    );
    if (!selection.selected) return { allowed: false, deniedBy: 'policy', reason: selection.reason };
    for (const capability of ctx.label.requires ?? []) {
      if (!(ctx.capabilities ?? []).includes(capability)) {
        return {
          allowed: false,
          deniedBy: 'capability',
          reason: `Tool '${ctx.toolName}' requires '${capability}'.`,
        };
      }
    }
    if (ctx.label.availableWhen === 'fullFileAccess' && !ctx.fullFileAccess) {
      return {
        allowed: false,
        deniedBy: 'availability',
        reason: `Tool '${ctx.toolName}' needs full file access.`,
      };
    }
  }
  return { allowed: true, reason: `Tool '${ctx.toolName}' is allowed.` };
}

export function explainAll(contexts: ExplainContext[]): {
  allowedTools: string[];
  denied: Record<string, { by: DeniedBy; reason: string }>;
} {
  const allowedTools: string[] = [];
  const denied: Record<string, { by: DeniedBy; reason: string }> = {};
  for (const ctx of contexts) {
    const result = explainTool(ctx);
    if (result.allowed) allowedTools.push(ctx.toolName);
    else denied[ctx.toolName] = { by: result.deniedBy ?? 'policy', reason: result.reason };
  }
  return { allowedTools, denied };
}
