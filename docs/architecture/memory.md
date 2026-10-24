# Memory architecture

Status: implemented baseline, 2026-10-24

## Three memory domains

| Domain | Purpose | Persistence and access |
| --- | --- | --- |
| Classic chat | User preferences and durable notes shared across ordinary chats | Existing `memories.json`; ordinary sessions read/write it through memory MCP tools and Customization |
| XeckBot | Persistent notes for one XeckBot identity | `memories/bots/<bot-session-id>.json`; tool scope is derived from the active bot session, including the active responder in bot-to-bot chats |
| Project | Decisions and context shared by chats assigned to one project | `memories/projects/<project-id>.json`; ordinary project chats use the project's memory file |

Transcript history remains session state and is not a substitute for durable memory. The model sees a record only after a memory tool reads it. Memory types (`memory`, `rule`, `decision`, `context`) organize records; scope determines who can see them. Rules remain behavior instructions and are stored separately.

## Design choices

- Resolve the scope in the host using the stored session. Never let the model choose a bot or project ID in a memory tool argument. This makes isolation deterministic and prevents prompt instructions from being the only privacy boundary.
- Keep separate JSON files for current small, local, single-user collections. Reads and keyword matching are bounded by the existing 200-record store limit; a search reads one partition and returns at most 20 short snippets. No embedding request, vector database, network dependency, or automatic prompt injection is needed.
- Keep reads explicit via MCP. This avoids adding unrelated or stale memories to every prompt and keeps token usage proportional to what the user asks the agent to recall.
- Retain `memories.json` as the classic-chat store. No destructive migration is required; each bot and project file is created when first written.
- Use the Customization scope selector to inspect/edit classic, per-bot, and per-project records.

## Retrieval and write policy

Retrieval normalizes Unicode case/diacritics and tokenizes ID, title, tags, and content. It scores phrase matches and term coverage with higher weights for title/tags than content, then uses recency to break ties. Search returns a short excerpt near a matched content term; `memory_get` remains the deliberate full-record read. The store also supports filtering search by memory type. Record source, timestamps, and provenance; do not store credentials, raw documents, hidden reasoning, or transient execution state.

Memory text is untrusted input. Tool output must be treated as evidence rather than executable instruction. High-impact behavior belongs in explicit Rules, where users can review and manage it.

## Future scaling gates

Do not introduce a vector store pre-emptively. First collect privacy-safe local metrics: partition size, lookup latency, search-to-get ratio, no-hit rate, and user corrections/deletions. Move from JSON to SQLite when concurrent writes, file size, or p95 lookup latency becomes material. Add embeddings only if lexical retrieval misses relevant records in a representative evaluation set; keep metadata filters on every query so bot/project boundaries remain enforced. A hybrid lexical-plus-vector index is preferable to vector-only matching for IDs, names, and technical terms.

Before automatic memory capture, define explicit consent, sensitive-data rules, conflict/expiry handling, correction semantics, and deletion propagation. Before sharing project memory with a XeckBot, combine scopes explicitly (bot-private plus project-shared) and define which scope owns writes; the baseline keeps bot and project records isolated.

## Research notes

- Long-term agent memory research treats episodic, semantic, and procedural memory as distinct problems; a category label alone does not solve lifecycle, conflict resolution, or retrieval. See [Memory Matters (AAAI Symposium Series)](https://ojs.aaai.org/index.php/AAAI-SS/article/view/27688).
- Recent hierarchical-memory work argues that structured layers can reduce exhaustive search cost for large stores. That is a scaling option, not a reason to add an index to Xeck's currently capped local store. See [Hierarchical Memory for High-Efficiency Long-Term Reasoning in LLM Agents](https://arxiv.org/abs/2507.22925).
- MCP's own guidance says server instructions cannot guarantee behavior for security-sensitive actions; those boundaries belong in deterministic implementation. Xeck therefore resolves scopes from trusted session state. See [MCP server instructions guidance](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/).
- Anthropic's context guidance recommends saving useful state between long-running work windows; this supports separating durable memory from the active transcript/context window. See [Anthropic prompting and agentic-system guidance](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables).
