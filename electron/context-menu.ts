import { clipboard, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

/** Electron does not provide Chromium's right-click editing menu by default. */
export function installContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    const flags = params.editFlags;

    if (params.isEditable) {
      items.push(
        { role: 'undo', enabled: flags.canUndo },
        { role: 'redo', enabled: flags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: flags.canCut },
        { role: 'copy', enabled: flags.canCopy },
        { role: 'paste', enabled: flags.canPaste },
        { role: 'selectAll', enabled: flags.canSelectAll },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy', enabled: flags.canCopy });
    }

    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: 'Copy link address',
        click: () => clipboard.writeText(params.linkURL),
      });
    }

    if (items.length) Menu.buildFromTemplate(items).popup({ window });
  });
}
