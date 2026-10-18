import { t } from '../../i18n/index.ts';
import { useEffect, useState } from 'react';
import type {
  BuiltinMcpStatus,
  McpServerRecord,
  McpServerStatus,
  McpServerWrite,
} from '../../../../shared/types.ts';
import { listMcp, putBuiltinMcp, putMcp } from '../../api/client.ts';
import { IconEdit, IconPlus, IconSpinner, IconTrash } from '../../ui/icons.tsx';
import { SettingCard, SettingRow, Switch } from '../../ui/SettingRow.tsx';
import type { McpMarketplaceEntry } from './mcpMarketplace.ts';
import { MarketplaceDialog } from './McpMarketplaceDialog.tsx';
import { McpServerModal } from './McpServerModal.tsx';
import {
  BUILTIN_MCP_TITLE,
  DEFAULT_BUILTIN_STATUS,
  OFF_LABEL,
  TRANSPORT_LABELS,
  asWrite,
  draftFromRecord,
  draftServer,
  emptyDraft,
  headerNames,
  builtinStatusText,
  receivedServers,
  statusText,
  templateDraft,
  tokenDetail,
  type ServerDraft,
} from './mcp-draft.ts';

const BUILTIN_STATUS_ERROR = "Could not load MCP servers";
const SAVE_ERROR = "Could not save MCP servers";

function groupTools<T extends { group?: string }>(tools: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const tool of tools) {
    const group = tool.group ?? 'Tools';
    groups.set(group, [...(groups.get(group) ?? []), tool]);
  }
  return [...groups.entries()];
}

export function McpSettings() {
  const [servers, setServers] = useState<McpServerRecord[]>([]);
  const [states, setStates] = useState<McpServerStatus[]>([]);
  const [builtin, setBuiltin] = useState<BuiltinMcpStatus>(DEFAULT_BUILTIN_STATUS);
  const [draft, setDraft] = useState<ServerDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingControl, setPendingControl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listMcp()
      .then((snapshot) => {
        setServers(receivedServers(snapshot.servers));
        setStates(snapshot.states);
        setBuiltin(snapshot.builtin ?? DEFAULT_BUILTIN_STATUS);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not load MCP servers")))
      .finally(() => setLoading(false));
  }, []);

  const save = (next: McpServerWrite[], controlId: string) => {
    setNotice(null);
    setPendingControl(controlId);
    void putMcp(next)
      .then((snapshot) => {
        setServers(receivedServers(snapshot.servers));
        setStates(snapshot.states);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("Could not save MCP servers")))
      .finally(() => setPendingControl(null));
  };

  const toggleServerTool = (serverId: string, toolName: string, enabled: boolean) => {
    if (pendingControl) return;
    const server = servers.find((item) => item.id === serverId);
    const state = states.find((item) => item.id === serverId);
    if (!server || !state) return;
    const current = new Set(server.enabledTools === null ? state.tools.map((tool) => tool.name) : server.enabledTools);
    if (enabled) current.add(toolName); else current.delete(toolName);
    const selected = current.size === state.tools.length ? null : [...current];
    save(servers.map((item) => ({ ...asWrite(item), enabledTools: item.id === serverId ? selected : item.enabledTools })), `tool:${serverId}:${toolName}`);
  };

  const toggleBuiltinTools = (toolNames: string[], enabled: boolean, controlId: string) => {
    if (pendingControl) return;
    setNotice(null);
    const current = new Set(builtin.tools.filter((tool) => tool.enabled).map((tool) => tool.name));
    for (const name of toolNames) {
      if (enabled) current.add(name); else current.delete(name);
    }
    const disabled = new Set(builtin.tools.map((tool) => tool.name).filter((name) => !current.has(name)));
    setPendingControl(controlId);
    const previous = builtin;
    setBuiltin({ ...builtin, tools: builtin.tools.map((tool) => ({ ...tool, enabled: current.has(tool.name) })), toolCount: current.size });
    void fetch('/api/mcp/builtin/tools', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: [...disabled] }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(t("Could not save MCP tool settings"));
      setBuiltin(await response.json() as BuiltinMcpStatus);
    }).catch((error: unknown) => {
      setBuiltin(previous);
      setNotice(error instanceof Error ? error.message : SAVE_ERROR);
    }).finally(() => setPendingControl(null));
  };

  const closeEditor = () => {
    if (connecting) return;
    setEditorOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const openEditor = (server: McpServerRecord | null) => {
    setEditingId(server?.id ?? null);
    setDraft(server ? draftFromRecord(server) : emptyDraft());
    setEditorOpen(true);
  };

  const openTemplate = (entry: McpMarketplaceEntry) => {
    setEditingId(null);
    setDraft(templateDraft(entry, servers.map((server) => server.id)));
    setMarketOpen(false);
    setEditorOpen(true);
  };

  return (
    <div className="stack">
      <div className="section-header">
        <div>
          <h2>{t("MCP")}</h2>
          <p className="lede">{t("Enabled servers connect on the next turn. Shell and files stay off.")}</p>
        </div>
        <span className="row-actions">
          <button type="button" className="text-button" disabled={pendingControl !== null} onClick={() => setMarketOpen(true)}>
            {t("Browse marketplace")}</button>
          <button
            type="button"
            className="text-button with-icon"
            disabled={pendingControl !== null}
            onClick={() => openEditor(null)}
          >
            <IconPlus />
            {t("New server")}</button>
        </span>
      </div>
      {loading ? (
        <SettingCard>
          <div className="flex min-h-20 items-center justify-center gap-2 py-4 text-ui text-muted" role="status" aria-live="polite">
            <IconSpinner />
            <span>{t("Loading MCP servers…")}</span>
          </div>
        </SettingCard>
      ) : (
      <>
      <SettingCard>
          <header className="card-header">
            <div>
              <strong>{BUILTIN_MCP_TITLE}</strong>
              <p>{t(builtinStatusText(builtin))}</p>
            </div>
            <span className="row-actions">
              <Switch
                checked={builtin.enabled}
                label={t("{0} enabled", { "0": BUILTIN_MCP_TITLE })}
                pending={pendingControl === 'builtin'}
                disabled={pendingControl !== null}
                onChange={(enabled) => {
                  if (pendingControl) return;
                  setNotice(null);
                  const previous = builtin;
                  setPendingControl('builtin');
                  setBuiltin({ ...builtin, enabled });
                  void putBuiltinMcp(enabled)
                    .then(setBuiltin)
                    .catch((error: unknown) => {
                      setBuiltin(previous);
                      setNotice(error instanceof Error ? error.message : t("Could not save MCP servers"));
                    })
                    .finally(() => setPendingControl(null));
                }}
              />
            </span>
          </header>
          {builtin.status === 'connected' && builtin.tools.length > 0 && (
            <details className="tool-list">
              <summary>
                <span>{t("Tools")}</span>
                <i className="chevron" />
              </summary>
              {groupTools(builtin.tools).map(([group, tools]) => (
                <details className="tool-subgroup" key={group} open>
                  <summary className="flex items-center justify-between gap-3">
                    <span>{t(group)} <span className="text-muted">{tools.filter((tool) => tool.enabled).length}/{tools.length}</span></span>
                    <span onClick={(event) => event.stopPropagation()}>
                      <Switch
                        checked={tools.every((tool) => tool.enabled)}
                        label={t("{0} tools enabled", { "0": group })}
                        pending={pendingControl === `builtin-group:${group}`}
                        disabled={pendingControl !== null}
                        onChange={(enabled) => toggleBuiltinTools(tools.map((tool) => tool.name), enabled, `builtin-group:${group}`)}
                      />
                    </span>
                  </summary>
                  {tools.map((tool) => (
                    <div className="setting-row" key={tool.name}>
                      <div>
                        <strong>{tool.name}</strong>
                        {tool.description && <p>{tool.description}</p>}
                      </div>
                      <Switch checked={Boolean(tool.enabled)} label={t("{0} enabled", { "0": tool.name })} disabled={pendingControl !== null} onChange={(enabled) => toggleBuiltinTools([tool.name], enabled, `builtin-tool:${tool.name}`)} />
                    </div>
                  ))}
                </details>
              ))}
            </details>
          )}
      </SettingCard>
      {servers.length === 0 ? (
        builtin ? null : (
          <SettingCard>
            <p className="catalog-empty">{t("No servers yet")}</p>
          </SettingCard>
        )
      ) : (
        servers.map((server) => {
          const state = states.find((item) => item.id === server.id);
          const detail = server.transport === 'http' ? server.url : [server.command, server.args].filter(Boolean).join(' ');
          return (
            <SettingCard key={server.id}>
              <header className="card-header">
                <div>
                  <strong>{server.id}</strong>
                  <p>{t(statusText(server, state))}</p>
                </div>
                <span className="row-actions">
                  <Switch
                    checked={server.enabled}
                    label={t("{0} enabled", { "0": server.id })}
                    pending={pendingControl === `toggle:${server.id}`}
                    disabled={pendingControl !== null}
                    onChange={(enabled) => {
                      if (pendingControl) return;
                      save(
                        servers.map((item) => asWrite(item, item.id === server.id ? enabled : item.enabled)),
                        `toggle:${server.id}`,
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("Edit {0}", { "0": server.id })}
                    disabled={pendingControl !== null}
                    onClick={() => openEditor(server)}
                  >
                    <IconEdit />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={pendingControl === `delete:${server.id}` ? t("Removing {0}", { "0": server.id }) : t("Remove {0}", { "0": server.id })}
                    aria-busy={pendingControl === `delete:${server.id}`}
                    data-pending={pendingControl === `delete:${server.id}` ? 'true' : 'false'}
                    disabled={pendingControl !== null}
                    onClick={() => {
                      if (pendingControl) return;
                      if (editingId === server.id) closeEditor();
                      save(
                        servers.filter((item) => item.id !== server.id).map((item) => asWrite(item)),
                        `delete:${server.id}`,
                      );
                    }}
                  >
                    {pendingControl === `delete:${server.id}` ? <span className="control-spinner" aria-hidden="true" /> : <IconTrash />}
                  </button>
                </span>
              </header>
              <SettingRow label={t(TRANSPORT_LABELS[server.transport])}>
                <span className="row-detail">{detail}</span>
              </SettingRow>
              {server.transport === 'http' && server.tokenConfigured && (
                <SettingRow label={t("Token")}>
                  <span className="row-detail">{tokenDetail(server)}</span>
                </SettingRow>
              )}
              {server.transport === 'http' && headerNames(server).length > 0 && (
                <SettingRow label={t("Headers")}>
                  <span className="row-detail">{headerNames(server).join(', ')}</span>
                </SettingRow>
              )}
              {server.transport === 'stdio' && server.env.length > 0 && (
                <SettingRow label={t("Environment")}>
                  <span className="row-detail">{server.env.map((item) => item.name).join(', ')}</span>
                </SettingRow>
              )}
              {state?.status === 'connected' && (state.tools ?? []).length > 0 && (
                <details className="tool-list">
                  <summary>
                    <span>{t("Tools")}</span>
                    <i className="chevron" />
                  </summary>
                  {(state.tools ?? []).map((tool) => (
                    <div className="setting-row" key={tool.name}>
                      <div>
                        <strong>{tool.name}</strong>
                        {tool.description && <p>{tool.description}</p>}
                      </div>
                      <Switch checked={Boolean(tool.enabled)} label={t("{0} enabled", { "0": tool.name })} disabled={pendingControl !== null} onChange={(enabled) => toggleServerTool(server.id, tool.name, enabled)} />
                    </div>
                  ))}
                </details>
              )}
            </SettingCard>
          );
        })
      )}
      </>
      )}
      {marketOpen && !editorOpen && (
        <MarketplaceDialog
          query={marketQuery}
          installedIds={servers.map((server) => server.id)}
          onQueryChange={setMarketQuery}
          onAdd={openTemplate}
          onClose={() => {
            setMarketOpen(false);
            setMarketQuery('');
          }}
        />
      )}
      {editorOpen && (
        <McpServerModal
          draft={draft}
          editing={editingId !== null}
          connecting={connecting}
          notice={notice}
          onChange={setDraft}
          onClose={closeEditor}
          onSave={() => {
            const next = draftServer(draft, editingId);
            if (!next || connecting) return;
            const kept = servers.filter((item) => item.id !== next.id && item.id !== editingId);
            setNotice(null);
            setConnecting(true);
            void putMcp([...kept.map((item) => asWrite(item)), next])
              .then((snapshot) => {
                setServers(receivedServers(snapshot.servers));
                setStates(snapshot.states);
                setConnecting(false);
                setEditorOpen(false);
                setEditingId(null);
                setDraft(emptyDraft());
              })
              .catch((error: unknown) => {
                setConnecting(false);
                setNotice(error instanceof Error ? error.message : t("Could not save MCP servers"));
              });
          }}
        />
      )}
      {notice && <p className="lede">{t(notice)}</p>}
    </div>
  );
}
