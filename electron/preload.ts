import { contextBridge, ipcRenderer } from 'electron';

const WINDOW_CHANNELS = {
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
} as const;

contextBridge.exposeInMainWorld('electronWindow', {
  minimize: () => ipcRenderer.send(WINDOW_CHANNELS.minimize),
  toggleMaximize: () => ipcRenderer.send(WINDOW_CHANNELS.toggleMaximize),
  close: () => ipcRenderer.send(WINDOW_CHANNELS.close),
});

contextBridge.exposeInMainWorld('electronUpdates', {
  check: (): Promise<string> => ipcRenderer.invoke('updates:check'),
});
