import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

const RELEASES_URL = 'https://github.com/Septillioner/xeck/releases';
let checking = false;
let downloaded = false;

function supportsAutomaticUpdates(): boolean {
  return process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE);
}

/** Keep update downloads and installation in the main process. */
export function installUpdates(isTrustedSender: (url: string) => boolean): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = app.getVersion().includes('-');
  autoUpdater.on('error', (error) => console.error('Update failed:', error));

  ipcMain.handle('updates:check', async (event) => {
    if (event.senderFrame !== event.sender.mainFrame || !isTrustedSender(event.sender.getURL())) {
      throw new Error('Untrusted update request');
    }
    return checkForUpdates();
  });

  if (app.isPackaged && supportsAutomaticUpdates()) {
    void checkForUpdates();
    const timer = setInterval(() => {
      if (!downloaded) void checkForUpdates();
    }, 4 * 60 * 60 * 1_000);
    timer.unref();
    app.once('before-quit', () => clearInterval(timer));
  }
}

async function checkForUpdates(): Promise<string> {
  if (!app.isPackaged) return 'development';
  if (checking) return 'busy';
  // Unsigned macOS builds and package-manager installs use manual updates.
  if (!supportsAutomaticUpdates()) {
    await shell.openExternal(RELEASES_URL);
    return 'manual';
  }

  checking = true;
  try {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed()) return 'busy';
    if (!downloaded) {
      const result = await autoUpdater.checkForUpdates();
      if (!result || !result.isUpdateAvailable) return 'current';
      if (window.isDestroyed()) return 'available';
      const choice = await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Xeck update',
        message: `Xeck ${result.updateInfo.version} is available.`,
        detail: 'Download the update now? You can keep working while it downloads.',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response !== 0) return 'available';
      await autoUpdater.downloadUpdate();
      downloaded = true;
    }
    if (window.isDestroyed()) return 'downloaded';
    const restart = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Xeck update',
      message: 'The update is ready to install.',
      detail: 'Restart Xeck to install it. Finish any running tasks first.',
      buttons: ['Restart and install', 'Later'],
      defaultId: 1,
      cancelId: 1,
    });
    if (restart.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
    return 'downloaded';
  } catch (error) {
    console.error('Update check failed:', error);
    return 'error';
  } finally {
    checking = false;
  }
}
