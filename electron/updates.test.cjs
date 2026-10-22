const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('electron/updates.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ packaged = false, platform = 'win32', env = {}, responses = [], available = true, fail = false } = {}) {
  const calls = { checks: 0, downloads: 0, installs: 0, links: [], dialogs: 0 };
  let handler;
  const updater = {
    on() {},
    async checkForUpdates() { calls.checks++; if (fail) throw new Error('offline'); return { isUpdateAvailable: available, updateInfo: { version: '5.0.0' } }; },
    async downloadUpdate() { calls.downloads++; },
    quitAndInstall() { calls.installs++; },
  };
  const electron = {
    app: { isPackaged: packaged, getVersion: () => '4.4.0-beta.2', once() {} },
    BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false }] },
    dialog: { async showMessageBox() { calls.dialogs++; return { response: responses.shift() ?? 1 }; } },
    ipcMain: { handle(channel, fn) { assert.equal(channel, 'updates:check'); handler = fn; } },
    shell: { async openExternal(url) { calls.links.push(url); } },
  };
  const exports = {};
  const context = { exports, require: (name) => name === 'electron' ? electron : { autoUpdater: updater },
    process: { platform, env }, console: { error() {} }, setImmediate: (fn) => fn(),
    setInterval: () => ({ unref() {} }), clearInterval() {} };
  vm.runInNewContext(source, context);
  exports.installUpdates((url) => url === 'file:///app/index.html');
  const frame = {};
  const event = { senderFrame: frame, sender: { mainFrame: frame, getURL: () => 'file:///app/index.html' } };
  return { calls, updater, electron, event, check: (next = event) => handler(next) };
}

test('development builds never query or download updates', async () => {
  const x = setup();
  assert.equal(await x.check(), 'development');
  assert.equal(x.calls.checks, 0);
});

test('untrusted frames cannot trigger update actions', async () => {
  const x = setup();
  await assert.rejects(x.check({ ...x.event, senderFrame: {} }), /Untrusted/);
  await assert.rejects(x.check({ ...x.event, sender: { ...x.event.sender, getURL: () => 'https://evil.example' } }), /Untrusted/);
});

test('unsigned macOS and non-AppImage Linux only open releases on explicit check', async () => {
  for (const platform of ['darwin', 'linux']) {
    const x = setup({ packaged: true, platform });
    assert.equal(x.calls.links.length, 0);
    assert.equal(await x.check(), 'manual');
    assert.deepEqual(x.calls.links, ['https://github.com/Septillioner/xeck/releases']);
    assert.equal(x.calls.downloads, 0);
  }
});

async function finishStartup(x) {
  // Startup check is asynchronous. Wait for its dialogs and finally block.
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

test('checking and declining an update never downloads or installs it', async () => {
  const x = setup({ packaged: true, responses: [1, 1] });
  assert.equal(await x.check(), 'busy');
  await finishStartup(x);
  assert.equal(await x.check(), 'available');
  assert.equal(x.calls.downloads, 0);
  assert.equal(x.updater.autoInstallOnAppQuit, false);
  assert.equal(x.updater.allowDowngrade, false);
  assert.equal(x.updater.allowPrerelease, true);
});

test('download and restart require separate consent; deferred install reuses download', async () => {
  const x = setup({ packaged: true, responses: [0, 1, 0] });
  await finishStartup(x);
  assert.equal(x.calls.downloads, 1);
  assert.equal(x.calls.installs, 0);
  assert.equal(await x.check(), 'downloaded');
  assert.equal(x.calls.downloads, 1);
  assert.equal(x.calls.installs, 1);
});

test('AppImage uses updater and handles offline and current states', async () => {
  for (const fail of [false, true]) {
    const x = setup({ packaged: true, platform: 'linux', env: { APPIMAGE: '/app/Xeck.AppImage' }, available: false, fail });
    await finishStartup(x);
    assert.equal(await x.check(), fail ? 'error' : 'current');
    assert.equal(x.calls.links.length, 0);
    assert.equal(x.calls.downloads, 0);
  }
});
