import assert from 'node:assert/strict';
import test from 'node:test';
import { shellInvocation, terminalShell } from './terminal-shell.ts';

test('host defaults are explicit and independent of the interactive SHELL', () => {
  assert.deepEqual(terminalShell(undefined, 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }), {
    name: 'cmd', executable: 'C:\\Windows\\System32\\cmd.exe', platform: 'win32',
  });
  assert.equal(terminalShell(undefined, 'darwin', { SHELL: '/bin/zsh' }).executable, '/bin/sh');
  assert.equal(terminalShell(undefined, 'linux', { SHELL: '/bin/bash' }).name, 'sh');
});

test('shell syntax is passed intact without an intermediate shell', () => {
  const command = 'printf "%s" "a b; $HOME"';
  for (const name of ['bash', 'zsh', 'sh']) {
    const invocation = shellInvocation(command, terminalShell(name, 'linux', {}));
    assert.equal(invocation.shell, false);
    assert.deepEqual(invocation.args, ['-c', command]);
  }
  const powershell = shellInvocation("Write-Output 'Türkçe $value; a b'", terminalShell('powershell', 'win32', {}));
  assert.equal(powershell.shell, false);
  assert.ok(Buffer.from(powershell.args.at(-1)!, 'base64').toString('utf16le').includes("Write-Output 'Türkçe $value; a b'"));
  assert.equal(shellInvocation('echo hello', terminalShell('cmd', 'win32', {})).shell, 'cmd.exe');
});

test('invalid or platform-incompatible shells never silently fall back', () => {
  assert.throws(() => terminalShell('fish', 'linux', {}), /Unsupported shell/);
  assert.throws(() => terminalShell('bash -c evil', 'linux', {}), /Unsupported shell/);
  assert.throws(() => terminalShell('cmd', 'linux', {}), /requires Windows/);
  assert.throws(() => terminalShell('powershell', 'darwin', {}), /use pwsh/);
  assert.equal(terminalShell('pwsh', 'linux', {}).executable, 'pwsh');
});
