import { isReasoningEffort, isServiceTier, type ReasoningEffort, type ServiceTier } from '../../../shared/types.ts';

/** JSON body as a plain object, or null when the request carried no usable object. */
export async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The parsed value, null when the field was absent, or false when it is invalid. */
export function readEffort(value: unknown): ReasoningEffort | null | false {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && isReasoningEffort(value)) return value;
  return false;
}

export function readServiceTier(value: unknown): ServiceTier | null | false {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && isServiceTier(value)) return value;
  return false;
}