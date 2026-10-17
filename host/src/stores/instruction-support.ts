/** Raised when rule or skill input is empty, too large, duplicated, or unknown. */
export class InstructionRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstructionRejected';
  }
}

/** Accepts a bare array or the `{ <key>: [] }` shape that earlier versions stored. */
export function recordList(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const rows = (value as Record<string, unknown>)[key];
  return Array.isArray(rows) ? rows : [];
}