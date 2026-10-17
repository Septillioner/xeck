import type { Dispatch, SetStateAction } from 'react';
import { MCP_MARKETPLACE, type McpMarketplaceEntry } from './mcpMarketplace.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import { TextField } from '../../ui/TextField.tsx';

export function MarketplaceDialog({
  query,
  installedIds,
  onQueryChange,
  onAdd,
  onClose,
}: {
  query: string;
  installedIds: string[];
  onQueryChange: Dispatch<SetStateAction<string>>;
  onAdd: (entry: McpMarketplaceEntry) => void;
  onClose: () => void;
}) {
  const installed = new Set(installedIds.map((id) => id.trim().toLowerCase()));
  const needle = query.trim().toLowerCase();
  const entries = MCP_MARKETPLACE.filter((entry) => {
    if (!needle) return true;
    return `${entry.title}\n${entry.blurb}\n${entry.command} ${entry.args}`.toLowerCase().includes(needle);
  });
  return (
    <Dialog title="MCP marketplace" onClose={onClose}>
      <div className="form-pad">
        <TextField
          autoFocus
          width="block"
          value={query}
          placeholder="Search servers"
          aria-label="Search marketplace"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {entries.length === 0 ? (
        <p className="catalog-empty">No servers match</p>
      ) : (
        entries.map((entry) => {
          const added = installed.has(entry.id.toLowerCase());
          return (
            <div className="setting-row" key={entry.id}>
              <div className="catalog-copy">
                <strong>{entry.title}</strong>
                <span className="row-detail">{entry.blurb}</span>
                <span className="row-detail">
                  {entry.command} {entry.args}
                </span>
                <span className="row-detail">{entry.sourceUrl}</span>
              </div>
              <span className="row-actions">
                <button type="button" className="text-button" disabled={added} onClick={() => onAdd(entry)}>
                  {added ? 'Added' : 'Add'}
                </button>
              </span>
            </div>
          );
        })
      )}
    </Dialog>
  );
}
