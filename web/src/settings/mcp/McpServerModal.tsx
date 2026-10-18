import { t } from '../../i18n/index.ts';
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
    <Dialog title={editing ? t("Edit MCP server") : t("New MCP server")} onClose={onClose}>
      <SettingRow label={t("Name")}>
        <TextField
          autoFocus
          width="wide"
          value={draft.id}
          aria-label={t("Server name")}
          onChange={(event) => onChange({ ...draft, id: event.target.value })}
        />
      </SettingRow>
      <SettingRow label={t("Transport")}>
        <Menu
          label={t("Transport")}
          value={draft.transport}
          options={MCP_TRANSPORTS.map((transport) => ({ value: transport, label: TRANSPORT_LABELS[transport] }))}
          onChange={(transport) => onChange({ ...draft, transport: transport as McpTransport })}
        />
      </SettingRow>
      {draft.transport === 'http' ? (
        <>
          <SettingRow label={t("URL")}>
            <TextField
              width="wide"
              value={draft.url}
              aria-label={t("Server URL")}
              onChange={(event) => onChange({ ...draft, url: event.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("Token")}>
            <span className="token-field">
              <span className="field-password-wrap">
                <TextField
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  value={draft.token}
                  placeholder={tokenPlaceholder(draft)}
                  aria-label={t("Bearer token")}
                  onChange={(event) => onChange({ ...draft, token: event.target.value, clearToken: false })}
                />
                <button
                  type="button"
                  className="field-eye"
                  aria-label={showToken ? t("Hide token") : t("Show token")}
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
                  {draft.clearToken ? t("Keep token") : t("Clear token")}
                </button>
              )}
            </span>
          </SettingRow>
          <SettingRow label={t("Ignore certificate")} detail={t("Accept self-signed or otherwise invalid TLS certificates when connecting.")}>
            <Switch
              checked={draft.ignoreCertificate}
              label={t("Ignore certificate")}
              onChange={(value) => onChange({ ...draft, ignoreCertificate: value })}
            />
          </SettingRow>
          <SecretList
            label={t("Headers")}
            addLabel={t("Add header")}
            namePlaceholder={t("Header")}
            nameAria={t("Header name")}
            valueAria={t("Header value")}
            removeAria={t("Remove header")}
            showAria={t("Show header")}
            hideAria={t("Hide header")}
            rows={draft.headers}
            shown={shownHeaders}
            onShown={setShownHeaders}
            onChange={(headers) => onChange({ ...draft, headers })}
          />
        </>
      ) : (
        <>
          <SettingRow label={t("Command")}>
            <TextField
              width="wide"
              value={draft.command}
              aria-label={t("Command")}
              onChange={(event) => onChange({ ...draft, command: event.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("Arguments")}>
            <TextField
              width="wide"
              value={draft.args}
              placeholder={t("Optional")}
              aria-label={t("Arguments")}
              onChange={(event) => onChange({ ...draft, args: event.target.value })}
            />
          </SettingRow>
          {draft.args.includes(MCP_FOLDER_PLACEHOLDER) && (
            <div className="form-pad">
              <p className="lede">{t("Replace {folder} with a folder path before saving.", { folder: MCP_FOLDER_PLACEHOLDER })}</p>
            </div>
          )}
          <SecretList
            label={t("Environment")}
            addLabel={t("Add variable")}
            namePlaceholder={t("NAME")}
            nameAria={t("Variable name")}
            valueAria={t("Variable value")}
            removeAria={t("Remove variable")}
            showAria={t("Show variable")}
            hideAria={t("Hide variable")}
            rows={draft.env}
            shown={shownEnv}
            onShown={setShownEnv}
            onChange={(env) => onChange({ ...draft, env })}
          />
        </>
      )}
      {notice && (
        <div className="form-pad">
          <p className="lede">{t(notice)}</p>
        </div>
      )}
      <footer className="modal-footer">
        {connecting && (
          <p className="status-line">
            <span className="shimmer-text">{CONNECTING_LABEL}</span>
          </p>
        )}
        <button type="button" disabled={connecting} onClick={onClose}>
          {t("Cancel")}</button>
        <button type="button" className={BUTTON.primary} disabled={!ready || connecting} onClick={onSave}>
          {editing ? t("Save server") : t("Add server")}
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
              placeholder={row.savedName && row.name.trim() === row.savedName ? t("Leave blank to keep") : undefined}
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