import { z } from 'zod';

/**
 * Host'un chat kimliği ve devir sözleşmesi için tipler ve Zod şemaları.
 * Workspace policy'si `agent/workspaces/library-policy.ts` içinde kütüphaneye çevrilir.
 */

/** Parent'ın devir anında izin verdiği kesin araç adları. */
export const GrantSchema = z.object({
  /** Exact tool names the parent was allowed to delegate at creation time. */
  tools: z.array(z.string()).default([]),
});
export type Grant = z.infer<typeof GrantSchema>;

export const ChatOriginUserSchema = z.object({ by: z.literal('user') });

/**
 * Alt agent da normal bir chat'tir; kendi id ve geçmişiyle parent'a bağlıdır.
 */
export const ChatOriginAgentSchema = z.object({
  by: z.literal('agent'),
  parent: z.string().min(1),
  task: z.string().min(1),
  stepIds: z.array(z.string()).optional(),
  grant: GrantSchema,
});

export const ChatOriginSchema = z.union([ChatOriginUserSchema, ChatOriginAgentSchema]);
export type ChatOrigin = z.infer<typeof ChatOriginSchema>;

export const ChatStateSchema = z.object({
  policyId: z.string().min(1),
  model: z.string().optional(),
  effort: z.string().optional(),
  tier: z.string().optional(),
});
export type ChatState = z.infer<typeof ChatStateSchema>;

/** Plan dosyası kök chat'e bağlıdır; alt agent'ta `activePlan` yoktur. */
export const SubAgentResultSchema = z.object({
  status: z.enum(['done', 'blocked', 'failed']),
  summary: z.string(),
});
export type SubAgentResult = z.infer<typeof SubAgentResultSchema>;

export const ChatSchema = z.object({
  id: z.string().min(1),
  origin: ChatOriginSchema,
  /** `"id@versiyon"` biçimi, örn. `"coding@1"`. */
  workspace: z.string().min(1),
  agentId: z.string().min(1),
  state: ChatStateSchema,
});
export type Chat = z.infer<typeof ChatSchema>;

export function parseWorkspaceRef(ref: string): { id: string; version: number } | null {
  const match = /^(.+)@(\d+)$/.exec(ref.trim());
  if (!match) return null;
  return { id: match[1] as string, version: Number(match[2]) };
}
