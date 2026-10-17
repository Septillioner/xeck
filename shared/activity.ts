const LOAD_SKILL_TOOL_NAME = 'load_skill';
const MCP_TOOL_PREFIX = 'mcp_';
const MCP_NAME_SEPARATOR = '__';
const XECK_MCP_SERVER_ID = 'xeck';
const MCP_LABEL_PREFIX = 'MCP · ';
const SKILL_LABEL_PREFIX = 'Skill · ';
const TERMINAL_LABEL_PREFIX = 'Terminal · ';
const ASK_QUESTION_LABEL_PREFIX = 'Ask · ';
const FILE_LABEL_PREFIX = 'File · ';
const RULE_LABEL_PREFIX = 'Rule · ';
const MEMORY_LABEL_PREFIX = 'Memory · ';
const FAILED_SUFFIX = ' failed';
const MIN_LINE_NUMBER = 1;

const XECK_TOOL_LABELS: Readonly<Record<string, string>> = {
  list_rules: `${RULE_LABEL_PREFIX}List rules`,
  add_rule: `${RULE_LABEL_PREFIX}Add rule`,
  remove_rule: `${RULE_LABEL_PREFIX}Remove rule`,
  list_skills: `${SKILL_LABEL_PREFIX}List skills`,
  write_skill: `${SKILL_LABEL_PREFIX}Write skill`,
  remove_skill: `${SKILL_LABEL_PREFIX}Remove skill`,
  list_mcps: `${MCP_LABEL_PREFIX}List MCP servers`,
  enable_mcp: `${MCP_LABEL_PREFIX}Enable MCP server`,
  disable_mcp: `${MCP_LABEL_PREFIX}Disable MCP server`,
  ask_question: `${ASK_QUESTION_LABEL_PREFIX}Ask question`,
  memory_search: `${MEMORY_LABEL_PREFIX}Search memories`,
  memory_get: `${MEMORY_LABEL_PREFIX}Read memory`,
  memory_upsert: `${MEMORY_LABEL_PREFIX}Save memory`,
  memory_delete: `${MEMORY_LABEL_PREFIX}Delete memory`,
  memory_list: `${MEMORY_LABEL_PREFIX}List memories`,
  plan_write: `${MCP_LABEL_PREFIX}Write plan`,
  plan_read: `${MCP_LABEL_PREFIX}Read plan`,
  todo_update: `${MCP_LABEL_PREFIX}Update plan step`,
  todo_add: `${MCP_LABEL_PREFIX}Add plan step`,
  read_file: `${FILE_LABEL_PREFIX}Read file`,
  replace_lines: `${FILE_LABEL_PREFIX}Replace file lines`,
  write_file: `${FILE_LABEL_PREFIX}Write file`,
  delete_file: `${FILE_LABEL_PREFIX}Delete file`,
  create_directory: `${FILE_LABEL_PREFIX}Create directory`,
  list_directory: `${FILE_LABEL_PREFIX}List directory`,
  list_directory_with_size: `${FILE_LABEL_PREFIX}List directory with sizes`,
  move_file: `${FILE_LABEL_PREFIX}Move file`,
  search_files: `${FILE_LABEL_PREFIX}Search files`,
  directory_tree: `${FILE_LABEL_PREFIX}Show directory tree`,
  get_file_info: `${FILE_LABEL_PREFIX}Get file information`,
  list_allowed_directories: `${FILE_LABEL_PREFIX}Show allowed directories`,
  run_command: `${TERMINAL_LABEL_PREFIX}Run command`,
  delegate_agents: 'Subagent · Delegate tasks',
};

export function activityLabel(toolName: string, args?: Record<string, unknown>): string | null {
  if (toolName === LOAD_SKILL_TOOL_NAME) {
    const name = typeof args?.name === 'string' ? args.name.trim() : '';
    return name ? `${SKILL_LABEL_PREFIX}${name}` : null;
  }
  if (!toolName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = toolName.slice(MCP_TOOL_PREFIX.length);
  const split = rest.indexOf(MCP_NAME_SEPARATOR);
  if (split <= 0) return null;

  const serverId = rest.slice(0, split);
  const name = rest.slice(split + MCP_NAME_SEPARATOR.length).trim();
  if (serverId === XECK_MCP_SERVER_ID) return xeckToolLabel(name, args);
  return externalMcpToolLabel(name);
}

function xeckToolLabel(name: string, args?: Record<string, unknown>): string {
  const label = XECK_TOOL_LABELS[name] ?? `${MCP_LABEL_PREFIX}${name}`;
  if (name === 'read_file') return `${appendPath(label, args)}${lineRange(args)}`;
  if (name === 'replace_lines') return `${appendPath(label, args)}${lineRange(args)}`;
  if (name === 'move_file') {
    const sourceLabel = appendPath(label, args, 'source');
    const destination = argumentText(args, 'destination');
    return destination ? `${sourceLabel} → ${destination}` : sourceLabel;
  }
  if (usesPathArgument(name)) return appendPath(label, args);
  return label;
}

function externalMcpToolLabel(name: string): string | null {
  if (name === 'run_command') return `${TERMINAL_LABEL_PREFIX}${name}`;
  if (name.startsWith('memory_')) return `${MEMORY_LABEL_PREFIX}${name}`;
  if (name.includes('rule')) return `${RULE_LABEL_PREFIX}${name}`;
  if (name.includes('file') || name.includes('directory')) return `${FILE_LABEL_PREFIX}${name}`;
  if (name.includes('ask_question')) return `${ASK_QUESTION_LABEL_PREFIX}${name}`;
  return name ? `${MCP_LABEL_PREFIX}${name}` : null;
}

function usesPathArgument(name: string): boolean {
  return name === 'write_file'
    || name === 'delete_file'
    || name === 'create_directory'
    || name === 'list_directory'
    || name === 'list_directory_with_size'
    || name === 'search_files'
    || name === 'directory_tree'
    || name === 'get_file_info';
}

function appendPath(label: string, args?: Record<string, unknown>, argument = 'path'): string {
  const path = argumentText(args, argument);
  return path ? `${label} · ${path}` : label;
}

function lineRange(args?: Record<string, unknown>): string {
  const startLine = positiveLine(args?.startLine);
  const endLine = positiveLine(args?.endLine);
  if (startLine !== null && endLine !== null) return ` · L${startLine}–${endLine}`;
  if (startLine !== null) return ` · from line ${startLine}`;
  if (endLine !== null) return ` · through line ${endLine}`;
  return '';
}

function positiveLine(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_LINE_NUMBER ? value : null;
}

function argumentText(args: Record<string, unknown> | undefined, key: string): string {
  return typeof args?.[key] === 'string' ? args[key].trim().replace(/\s+/g, ' ') : '';
}

export function activityBaseLabel(label: string): string {
  return label.endsWith(FAILED_SUFFIX) ? label.slice(0, -FAILED_SUFFIX.length) : label;
}

export function isSkillOrMcpLabel(label: string): boolean {
  const base = activityBaseLabel(label);
  return base.startsWith(SKILL_LABEL_PREFIX)
    || base.startsWith(MCP_LABEL_PREFIX)
    || base.startsWith(TERMINAL_LABEL_PREFIX)
    || base.startsWith(MEMORY_LABEL_PREFIX)
    || base.startsWith(ASK_QUESTION_LABEL_PREFIX)
    || base.startsWith(FILE_LABEL_PREFIX)
    || base.startsWith(RULE_LABEL_PREFIX);
}

export function markActivityFailed(label: string): string {
  if (label.endsWith(FAILED_SUFFIX)) return label;
  return `${label}${FAILED_SUFFIX}`;
}
