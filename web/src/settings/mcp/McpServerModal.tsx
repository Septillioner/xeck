import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  MCP_TRANSPORTS,
  type McpTransport,
} from '../../../../shared/types.ts';
import { BUTTON } from '../../ui/button-styles.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import { IconEye, IconEyeOff, IconTrash } from '../../ui/icons.tsx';
import { Menu } from '../../ui/Menu.tsx';
import { SettingRow, Switch } from '../../ui/SettingRow.tsx';
import { MCP_FOLDER_PLACEHOLDER } from './mcpMarketplace.ts';
import {
  CONNECTING_LABEL,
  TRANSPORT_LABELS,
  draftServer,
  replaceRow,
  tokenPlaceholder,
  type SecretDraft,
  type ServerDraft,
} from './mcp-draft.ts';
import { TextField } from '../../ui/TextField.tsx';

export function McpServerModal({
  draft,
  editing,
  connecting,
  notice,
  onChange,
  onClose,
  onSave,
}: {
  draft: ServerDraft;
  editing: boolean;
  connecting: boolean;
  notice: string | null;
  onChange: (draft: ServerDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const [shownHeaders, setShownHeaders] = useState<Record<number, boolean>>({});
  const [shownEnv, setShownEnv] = useState<Record<number, boolean>>({});
  const ready = draftServer(draft) !== null;

  return (
    <Dialog title={editing ? 'Edit MCP server' : 'New MCP server'} onClose={onClose}>
      <SettingRow label="Name">
        <TextField
          autoFocus
          width="wide"
          value={draft.id}
          aria-label="Server name"
          onChange={(event) => onChange({ ...draft, id: event.target.value })}
        />
      </SettingRow>
      <SettingRow label="Transport">
        <Menu
          label="Transport"
          value={draft.transport}
          options={MCP_TRANSPORTS.map((transport) => ({ value: transport, label: TRANSPORT_LABELS[transport] }))}
          onChange={(transport) => onChange({ ...draft, transport: transport as McpTransport })}
        />
      </SettingRow>
      {draft.transport === 'http' ? (
        <>
          <SettingRow label="URL">
            <TextField
              width="wide"
              value={draft.url}
              aria-label="Server URL"
              onChange={(event) => onChange({ ...draft, url: event.target.value })}
            />
          </SettingRow>
          <SettingRow label="Token">
            <span className="token-field">
              <span className="field-password-wrap">
                <TextField
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  value={draft.token}
                  placeholder={tokenPlaceholder(draft)}
                  aria-label="Bearer token"
                  onChange={(event) => onChange({ ...draft, token: event.target.value, clearToken: false })}
                />
                <button
                  type="button"
                  className="field-eye"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  onClick={() => setShowToken((shown) => !shown)}
                >
                  {showToken ? <IconEyeOff /> : <IconEye />}
                </button>
              </span>
              {draft.tokenConfigured && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onChange({ ...draft, token: '', clearToken: !draft.clearToken })}
                >
                  {draft.clearToken ? 'Keep token' : 'Clear token'}
                </button>
              )}
            </span>
          </SettingRow>
          <SettingRow label="Ignore certificate" detail="Accept self-signed or otherwise invalid TLS certificates when connecting.">
            <Switch
              checked={draft.ignoreCertificate}
              label="Ignore certificate"
              onChange={(value) => onChange({ ...draft, ignoreCertificate: value })}
            />
          </SettingRow>
          <SecretList
            label="Headers"
            addLabel="Add header"
            namePlaceholder="Header"
            nameAria="Header name"
            valueAria="Header value"
            removeAria="Remove header"
            showAria="Show header"
            hideAria="Hide header"
            rows={draft.headers}
            shown={shownHeaders}
            onShown={setShownHeaders}
            onChange={(headers) => onChange({ ...draft, headers })}
          />
        </>
      ) : (
        <>
          <SettingRow label="Command">
            <TextField
              width="wide"
              value={draft.command}
              aria-label="Command"
              onChange={(event) => onChange({ ...draft, command: event.target.value })}
            />
          </SettingRow>
          <SettingRow label="Arguments">
            <TextField
              width="wide"
              value={draft.args}
              placeholder="Optional"
              aria-label="Arguments"
              onChange={(event) => onChange({ ...draft, args: event.target.value })}
            />
          </SettingRow>
          {draft.args.includes(MCP_FOLDER_PLACEHOLDER) && (
            <div className="form-pad">
              <p className="lede">Replace {MCP_FOLDER_PLACEHOLDER} with a folder path before saving.</p>
            </div>
          )}
          <SecretList
            label="Environment"
            addLabel="Add variable"
            namePlaceholder="NAME"
            nameAria="Variable name"
            valueAria="Variable value"
            removeAria="Remove variable"
            showAria="Show variable"
            hideAria="Hide variable"
            rows={draft.env}
            shown={shownEnv}
            onShown={setShownEnv}
            onChange={(env) => onChange({ ...draft, env })}
          />
        </>
      )}
      {notice && (
        <div className="form-pad">
          <p className="lede">{notice}</p>
        </div>
      )}
      <footer className="modal-footer">
        {connecting && (
          <p className="status-line">
            <span className="shimmer-text">{CONNECTING_LABEL}</span>
          </p>
        )}
        <button type="button" disabled={connecting} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={BUTTON.primary} disabled={!ready || connecting} onClick={onSave}>
          {editing ? 'Save server' : 'Add server'}
        </button>
      </footer>
    </Dialog>
  );
}

function SecretList({
  label,
  addLabel,
  namePlaceholder,
  nameAria,
  valueAria,
  removeAria,
  showAria,
  hideAria,
  rows,
  shown,
  onShown,
  onChange,
}: {
  label: string;
  addLabel: string;
  namePlaceholder: string;
  nameAria: string;
  valueAria: string;
  removeAria: string;
  showAria: string;
  hideAria: string;
  rows: SecretDraft[];
  shown: Record<number, boolean>;
  onShown: Dispatch<SetStateAction<Record<number, boolean>>>;
  onChange: (rows: SecretDraft[]) => void;
}) {
  return (
    <div className="form-pad">
      <p className="setting-label">{label}</p>
      {rows.map((row, index) => (
        <span className="env-row" key={index}>
          <TextField
            value={row.name}
            aria-label={nameAria}
            placeholder={namePlaceholder}
            onChange={(event) => onChange(replaceRow(rows, index, { ...row, name: event.target.value }))}
          />
          <span className="field-password-wrap">
            <TextField
              type={shown[index] ? 'text' : 'password'}
              autoComplete="off"
              value={row.value}
              placeholder={row.savedName && row.name.trim() === row.savedName ? 'Leave blank to keep' : undefined}
              aria-label={valueAria}
              onChange={(event) => onChange(replaceRow(rows, index, { ...row, value: event.target.value }))}
            />
            <button
              type="button"
              className="field-eye"
              aria-label={shown[index] ? hideAria : showAria}
              onClick={() => onShown((current) => ({ ...current, [index]: !current[index] }))}
            >
              {shown[index] ? <IconEyeOff /> : <IconEye />}
            </button>
          </span>
          <button
            type="button"
            className="icon-button danger"
            aria-label={removeAria}
            onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
          >
            <IconTrash />
          </button>
        </span>
      ))}
      <span className="actions">
        <button type="button" onClick={() => onChange([...rows, { name: '', value: '', savedName: null }])}>
          {addLabel}
        </button>
      </span>
    </div>
  );
}