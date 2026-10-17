import type { CompiledRequest } from 'poyraz';
import type { ContextMessageNode, ContextTree, SkillRecord } from '../../../../../shared/types.ts';
import { HOST_SUMMARY_PREFIX } from '../../../domain/summary.ts';

interface CompiledToolSchemaView {
  function?: { name?: string; description?: string; parameters?: unknown };
}

/**
 * The sidebar tree, read from the request the library compiled for the agent. The
 * system text, the tool schemas and the history are exactly what a send would carry;
 * only the rule and skill rows come from the host stores, because the library
 * reports them as one joined text.
 */
export function buildContextTree(compiled: CompiledRequest, rules: string[], skills: SkillRecord[]): ContextTree {
  const skillBodies = new Set(skills.map((skill) => skill.content));
  const loaded = new Set<string>();
  const summary: string[] = [];
  const conversation: ContextMessageNode[] = [];
  for (const message of compiled.messages) {
    const content = message.content ?? '';
    if (!content || message.role === 'system') continue;
    if (message.role === 'user' && content.startsWith(HOST_SUMMARY_PREFIX)) {
      summary.push(content);
      continue;
    }
    if (message.role === 'tool' && skillBodies.has(content)) {
      loaded.add(content);
      continue;
    }
    conversation.push({ role: message.role, content });
  }

  const categoryByName = new Map(compiled.toolSchemas.map((schema) => [schema.name, schema.category]));
  const schemas = (compiled.tools as CompiledToolSchemaView[]).filter((tool) => tool.function?.name);
  const plainTools = schemas
    .filter((tool) => categoryByName.get(tool.function?.name ?? '') !== 'mcp')
    .map((tool) => [tool.function?.name, tool.function?.description].filter(Boolean).join('\n'));
  const mcp = schemas
    .filter((tool) => categoryByName.get(tool.function?.name ?? '') === 'mcp')
    .map((tool) => ({
      name: tool.function?.name ?? '',
      description: tool.function?.description ?? '',
      schema: tool.function?.parameters ? JSON.stringify(tool.function.parameters) : '',
    }));

  return {
    system: compiled.parts.system,
    tools: plainTools.join('\n\n'),
    rules,
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      loaded: loaded.has(skill.content),
    })),
    mcp,
    summary,
    conversation,
  };
}
