export const SUMMARY_COMMAND = 'summary';
export const COMMAND_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const COMMAND_TEXT = /^\/(\S+)(?:\s+([\s\S]*))?$/;

export function parseCommand(content: string): { name: string; rest: string } | null {
  const match = COMMAND_TEXT.exec(content.trim());
  if (!match) return null;
  return { name: match[1], rest: match[2]?.trim() ?? '' };
}

export function isContextSummary(content: string): boolean {
  const command = parseCommand(content);
  return command?.name.toLowerCase() === SUMMARY_COMMAND;
}
