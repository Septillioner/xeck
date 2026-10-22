import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { installContextMenu } from './context-menu';
import { installUpdates } from './updates';

const HOST_NAME = '127.0.0.1';
/** Host port for `npm run dev`, which is already running when Electron opens. */
const DEV_HOST_PORT = 8787;
/**
 * Host port for the packaged app. It ships its own host process, so a different
 * port lets the installed app and `npm run dev` run side by side: the dev host
 * keeps 8787 and never collides with the packaged one.
 */
const PACKAGED_HOST_PORT = 18_787;
const VITE_DEV_URL = 'http://127.0.0.1:5173';
const READY_TIMEOUT_MS = 15_000;
const READY_INTERVAL_MS = 100;
/**
 * Schemes `shell.openExternal` is allowed to launch. Anything else (`file:`,
 * `javascript:`, network shares) is dropped instead of handed to the OS.
 */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

app.setName('Xeck');
const legacyUserData = join(app.getPath('appData'), 'Poyraz');
const previousUserData = join(app.getPath('appData'), 'Xeck');
// Chromium must not create the host's xeck data folder before migration consent.
app.setPath('userData', existsSync(legacyUserData) ? legacyUserData
  : existsSync(join(previousUserData, 'Preferences')) || existsSync(join(previousUserData, 'Local State')) ? previousUserData
    : join(app.getPath('appData'), 'xeck-desktop'));

let hostProcess: ChildProcess | undefined;
let openingWindow: Promise<void> | undefined;
/** URL the window actually loaded; the navigation guard compares against it. */
let appEntryUrl = '';

function isDesktopDev(): boolean {
  const configured = process.env.XECK_DESKTOP_DEV ?? process.env.POYRAZ_DESKTOP_DEV;
  if (configured === '1') return true;
  if (configured === '0') return false;
  return !app.isPackaged;
}

async function startApplication(): Promise<void> {
  const window = createMainWindow();
  const hostPort = isDesktopDev() ? DEV_HOST_PORT : PACKAGED_HOST_PORT;
  if (isDesktopDev()) {
    // Host and Vite run as separate dev servers (`npm run dev:desktop`);
    // the renderer uses relative `/api` through the Vite proxy.
    await waitForUrl(VITE_DEV_URL, 'Vite dev server');
    await waitForUrl(`http://${HOST_NAME}:${hostPort}/api/migrations`, 'Host dev server');
    await window.loadURL(VITE_DEV_URL);
    appEntryUrl = window.webContents.getURL();
    window.show();
    return;
  }

  if (!hostProcess) hostProcess = startHostProcess(hostPort);
  await waitForUrl(`http://${HOST_NAME}:${hostPort}/api/migrations`, 'Host');

  const rendererPath = join(runtimeRoot(), 'web', 'dist', 'index.html');
  await window.loadFile(rendererPath, {
    query: { apiBase: `http://${HOST_NAME}:${hostPort}` },
  });
  appEntryUrl = window.webContents.getURL();
  window.show();
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    title: 'Xeck',
    icon: join(runtimeRoot(), 'assets', 'branding', 'xeck.png'),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#000000',
    frame: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  installContextMenu(window);

  // Links must never turn the app window into a browser tab: `target="_blank"`
  // and `window.open` are denied here and routed to the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (appEntryUrl !== '' && isSameDocument(url, appEntryUrl)) return;
    event.preventDefault();
    openExternally(url);
  });

  return window;
}

/** Same document up to the fragment: hash changes are in-app routing. */
function isSameDocument(target: string, entry: string): boolean {
  try {
    const targetUrl = new URL(target);
    const entryUrl = new URL(entry);
    targetUrl.hash = '';
    entryUrl.hash = '';
    return targetUrl.href === entryUrl.href;
  } catch {
    return false;
  }
}

function openExternally(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (!EXTERNAL_PROTOCOLS.has(protocol)) return;
    void shell.openExternal(url);
  } catch {
    // Malformed URL: drop it rather than surface an error dialog.
  }
}

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

function startHostProcess(hostPort: number): ChildProcess {
  const hostEntry = join(runtimeRoot(), 'host', 'dist', 'index.js');
  if (!existsSync(hostEntry)) throw new Error(`Host entry is missing: ${hostEntry}`);

  const child = spawn(process.execPath, [hostEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      XECK_HOST_PORT: String(hostPort),
      PATH: process.platform === 'win32' ? process.env.PATH
        : ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH, '/usr/bin', '/bin'].filter(Boolean).join(':'),
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  child.once('exit', (code, signal) => {
    if (hostProcess === child) hostProcess = undefined;
    if (code !== 0 && signal === null) {
      console.error(`Host exited with code ${code ?? 'unknown'}`);
    }
  });
  return child;
}

function runtimeRoot(): string {
  if (app.isPackaged) return process.resourcesPath;
  return dirname(dirname(__dirname));
}

async function waitForUrl(url: string, label: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Retry while the local server starts.
    }
    await delay(READY_INTERVAL_MS);
  }

  throw new Error(`${label} did not become ready in time`);
}

function stopHostProcess(): void {
  if (!hostProcess || hostProcess.killed) return;
  hostProcess.kill();
  hostProcess = undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function openApplication(): Promise<void> {
  if (openingWindow) return openingWindow;
  openingWindow = startApplication().catch((error) => {
    console.error(error);
    stopHostProcess();
    app.quit();
  }).finally(() => { openingWindow = undefined; });
  return openingWindow;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } else if (app.isReady()) void openApplication();
  });
  void app.whenReady().then(async () => {
    await openApplication();
    installUpdates((url) => appEntryUrl !== '' && isSameDocument(url, appEntryUrl));
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void openApplication();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopHostProcess);
