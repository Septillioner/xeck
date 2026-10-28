import { FileToolRejected } from './file-access.ts';

export const TERMINAL_SHELLS = ['cmd', 'powershell', 'pwsh', 'bash', 'zsh', 'sh'] as const;
export type TerminalShell = typeof TERMINAL_SHELLS[number];

export function terminalShell(requested?: string, platform = process.platform, env = process.env) {
  const name = requested ?? (platform === 'win32' ? 'cmd' : 'sh');
  if (!TERMINAL_SHELLS.includes(name as TerminalShell)) {
    throw new FileToolRejected(`Unsupported shell: ${name}. Choose ${TERMINAL_SHELLS.join(', ')}.`);
  }
  if (platform !== 'win32' && (name === 'cmd' || name === 'powershell')) {
    throw new FileToolRejected(`${name} requires Windows; use pwsh for cross-platform PowerShell.`);
  }
  const executable = name === 'cmd'
    ? env.ComSpec || env.COMSPEC || 'cmd.exe'
    : platform === 'win32' ? `${name}.exe` : name === 'sh' ? '/bin/sh' : name;
  return { name: name as TerminalShell, executable, platform };
}

export function shellInvocation(command: string, shell: ReturnType<typeof terminalShell>) {
  if (shell.name === 'cmd') {
    // Let Node apply its CMD-specific quoting and /d /s /c invocation.
    return { executable: command, args: [] as string[], shell: shell.executable };
  }
  const args = shell.name === 'powershell' || shell.name === 'pwsh'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from([
      "$ErrorActionPreference = 'Stop'",
      '[Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      command,
      'if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }',
    ].join('\n'), 'utf16le').toString('base64')]
    : ['-c', command];
  return { executable: shell.executable, args, shell: false as const };
}
