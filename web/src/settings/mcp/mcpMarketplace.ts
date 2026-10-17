export interface McpMarketplaceEntry {
  id: string;
  title: string;
  blurb: string;
  command: string;
  args: string;
  sourceUrl: string;
}

export const MCP_FOLDER_PLACEHOLDER = '<folder>';

export const MCP_MARKETPLACE: McpMarketplaceEntry[] = [
  {
    id: 'playwright',
    title: 'Playwright',
    blurb: 'Browser automation for navigation, screenshots, and form filling.',
    command: 'npx',
    args: '-y @playwright/mcp@latest',
    sourceUrl: 'https://github.com/microsoft/playwright-mcp',
  },
  {
    id: 'sequential-thinking',
    title: 'Sequential Thinking',
    blurb: 'Step-by-step reasoning helper for complex problems.',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-sequential-thinking',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'memory',
    title: 'Memory',
    blurb: 'Knowledge-graph memory across turns. Separate from Xeck memories.',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-memory',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    id: 'filesystem',
    title: 'Filesystem',
    blurb: 'Read and write files under one folder you choose.',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-filesystem <folder>',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
  },
];
