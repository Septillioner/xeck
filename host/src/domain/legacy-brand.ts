/** Read old application identifiers without rewriting user text or library imports. */
export function xeckAgentId(value: string): string {
  return value === 'poyraz-agent' ? 'xeck' : value;
}

export function xeckWorkspace(value: string): string {
  return value === 'poyraz-agent' ? 'xeck' : value.replace(/^poyraz-agent@/, 'xeck@');
}

export function xeckPolicyId(value: string): string {
  return value === 'pa-agent' ? 'xeck-agent' : value === 'pa-ask' ? 'xeck-ask' : value;
}

export function xeckToolName(value: string): string {
  return value.replace(/^mcp_poyraz__/, 'mcp_xeck__');
}

export function xeckSource(value: string): string {
  return value === 'poyraz' ? 'xeck' : value;
}

/** Session metadata, grants and historical tool calls; content/title/arguments stay verbatim. */
export function migrateSessionBrand<T>(value: T): T {
  function visit(item: unknown, key = ''): unknown {
    if (typeof item === 'string') {
      if (key === 'agentId') return xeckAgentId(item);
      if (key === 'workspace') return xeckWorkspace(item);
      if (key === 'policyId') return xeckPolicyId(item);
      if (['name', 'toolName', 'tools', 'tool'].includes(key)) return xeckToolName(item);
      return item;
    }
    if (Array.isArray(item)) return item.map((row) => visit(row, key));
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).map(([field, child]) => [field,
      ['arguments', 'args', 'providerMeta', 'content'].includes(field) ? child : visit(child, field)]));
  }
  return visit(value) as T;
}
