import type { ProviderKind } from '../../../shared/types.ts';

/** Every bound the host enforces on tool input, stored records, and request bodies. */
export const MAX_MESSAGE_CHARS = 32_000;
export const MAX_FILE_TOOL_RETURNED_BYTES = 20_000;
export const DEFAULT_FILE_TOOL_LINE_WINDOW = 200;
export const MAX_FILE_TOOL_READ_BYTES = 10_000_000;
export const MAX_FILE_TOOL_PATH_CHARS = 4_096;
export const DEFAULT_FILE_TOOL_MAX_DEPTH = 3;
export const MAX_FILE_TOOL_MAX_DEPTH = 12;
export const DEFAULT_FILE_TOOL_MAX_ENTRIES = 200;
export const MAX_FILE_TOOL_MAX_ENTRIES = 1_000;
export const DEFAULT_FILE_TOOL_MAX_RESULTS = 100;
export const MAX_FILE_TOOL_MAX_RESULTS = 500;
export const MAX_FILE_TOOL_QUERY_CHARS = 256;
export const MAX_FILE_TOOL_DIFF_BYTES = 20_000;
export const MAX_FILE_TOOL_DIFF_LINES = 400;
export const DEFAULT_TERMINAL_TIMEOUT_MS = 30_000;
export const MAX_TERMINAL_TIMEOUT_MS = 300_000;
export const DEFAULT_TERMINAL_OUTPUT_BYTES = 20_000;
export const MAX_TERMINAL_OUTPUT_BYTES = 200_000;
export const MAX_TERMINAL_COMMAND_CHARS = 8_000;
export const MAX_TERMINAL_CWD_CHARS = 4_096;

export const MAX_RULE_COUNT = 100;
export const MAX_RULE_TEXT_LENGTH = 4_000;
export const MAX_SKILL_COUNT = 50;
export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 500;
export const MAX_SKILL_CONTENT_LENGTH = 32_000;

export const MAX_MEMORY_COUNT = 200;
export const MAX_MEMORY_ID_LENGTH = 64;
export const MAX_MEMORY_TITLE_LENGTH = 160;
export const MAX_MEMORY_CONTENT_LENGTH = 8_000;
export const MAX_MEMORY_TAG_LENGTH = 32;
export const MAX_MEMORY_TAG_COUNT = 8;
export const MAX_MEMORY_QUERY_LENGTH = 200;
export const MEMORY_SNIPPET_CHARS = 160;
export const DEFAULT_MEMORY_SEARCH_LIMIT = 8;
export const MAX_MEMORY_SEARCH_LIMIT = 20;
export const DEFAULT_MEMORY_LIST_LIMIT = 50;
export const MAX_MEMORY_LIST_LIMIT = 100;

export const MAX_PLAN_TODOS = 30;
export const MAX_PLAN_TODO_CONTENT_CHARS = 120;
export const MAX_PLAN_BODY_CHARS = 20_000;
export const MAX_PLAN_NOTE_CHARS = 200;
export const MAX_PLAN_NAME_CHARS = 120;
export const MAX_PLAN_ID_CHARS = 64;

export const SKILL_FILE_NAME = 'SKILL.md';
export const SKILL_ALT_FILE_NAME = 'skill.md';
export const RULE_FILE_EXTENSION = '.md';
export const RULE_INDEX_WIDTH = 3;
export const RULE_SLUG_MAX_CHARS = 48;
export const DEFAULT_RULE_SLUG = 'rule';
export const MIGRATED_EXTENSION = '.migrated';
export const KEYED_PROVIDERS: readonly ProviderKind[] = ['openai', 'groq', 'gemini', 'openrouter'];