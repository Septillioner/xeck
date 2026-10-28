import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  DEFAULT_TERMINAL_OUTPUT_BYTES,
  DEFAULT_TERMINAL_TIMEOUT_MS,
  MAX_TERMINAL_COMMAND_CHARS,
  MAX_TERMINAL_CWD_CHARS,
  MAX_TERMINAL_OUTPUT_BYTES,
  MAX_TERMINAL_TIMEOUT_MS,
} from '../infra/limits.ts';
import { FileToolRejected } from './file-access.ts';
import { readSettings } from '../stores/settings-store.ts';
import { shellInvocation, terminalShell } from './terminal-shell.ts';

const UTF8 = 'utf8';

export interface TerminalResult {
  ok: boolean;
  command: string;
  cwd: string;
  shell: string;
  platform: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

export interface TerminalInput {
  env?: Record<string, string | null>;
  stdin?: string;
  outputEncoding?: string;
}

const MAX_INPUT_BYTES = 1_000_000;

function commandEnvironment(overrides: TerminalInput['env']): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (overrides === undefined) return env;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new FileToolRejected('env must be an object of string values or null to remove a variable.');
  }
  let bytes = 0;
  for (const [key, value] of Object.entries(overrides)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || (value !== null && (typeof value !== 'string' || value.includes('\0')))) {
      throw new FileToolRejected('Invalid environment variable name or value.');
    }
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value ?? '');
    if (bytes > 64_000) throw new FileToolRejected('Environment overrides exceed 64000 bytes.');
    // Windows names are case insensitive, including PATH/Path. Never pass both.
    const previous = process.platform === 'win32' ? Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase()) : key;
    if (previous) delete env[previous];
    if (value !== null) env[key] = value;
  }
  return env;
}

export async function runCommandTool(
  command: string,
  requestedCwd: string | undefined,
  requestedTimeoutMs: number | undefined,
  requestedOutputBytes: number | undefined,
  signal?: AbortSignal,
  requestedShell?: string,
  input: TerminalInput = {},
): Promise<TerminalResult> {
  const settings = await readSettings();
  if (!settings.fullFileAccess) {
    throw new FileToolRejected('Terminal access requires full file access to be enabled.');
  }
  const normalizedCommand = normalizeCommand(command);
  const cwd = resolveCwd(requestedCwd, settings.workspaceRoot);
  const timeoutMs = boundedNumber(requestedTimeoutMs, 1, MAX_TERMINAL_TIMEOUT_MS, DEFAULT_TERMINAL_TIMEOUT_MS, 'timeoutMs');
  const maxOutputBytes = boundedNumber(
    requestedOutputBytes,
    1,
    MAX_TERMINAL_OUTPUT_BYTES,
    DEFAULT_TERMINAL_OUTPUT_BYTES,
    'maxOutputBytes',
  );
  if (input.stdin !== undefined && (typeof input.stdin !== 'string' || Buffer.byteLength(input.stdin) > MAX_INPUT_BYTES)) {
    throw new FileToolRejected('stdin must be a string of at most 1000000 UTF-8 bytes.');
  }
  const env = commandEnvironment(input.env);
  const encoding = input.outputEncoding ?? 'utf-8';
  try { new TextDecoder(encoding); } catch { throw new FileToolRejected(`Unsupported output encoding: ${encoding}`); }
  return executeCommand(normalizedCommand, cwd, timeoutMs, maxOutputBytes, signal, terminalShell(requestedShell), env, input.stdin, encoding);
}

function executeCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  maxOutputBytes: number,
  signal?: AbortSignal,
  selectedShell = terminalShell(),
  env = process.env,
  stdin?: string,
  outputEncoding = 'utf-8',
): Promise<TerminalResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FileToolRejected('Terminal command was cancelled.'));
      return;
    }
    const startedAt = Date.now();
    const invocation = shellInvocation(command, selectedShell);
    const child = spawn(invocation.executable, invocation.args, {
      cwd,
      env,
      shell: invocation.shell,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    const output = new BoundedOutput(maxOutputBytes, outputEncoding);
    let timedOut = false;
    let settled = false;
    let terminationRequested = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const fallbackKill = () => {
      if (!settled && !child.killed) child.kill();
    };
    const terminate = () => {
      if (settled || terminationRequested) return;
      terminationRequested = true;

      if (process.platform === 'win32' && child.pid !== undefined) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.once('error', fallbackKill);
        killer.once('close', (exitCode) => {
          if (exitCode !== 0) fallbackKill();
        });
        return;
      }

      if (child.pid === undefined) {
        fallbackKill();
        return;
      }
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        fallbackKill();
        return;
      }
      forceKillTimer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          fallbackKill();
        }
      }, 500);
      forceKillTimer.unref();
    };
    const clearForceKillTimer = () => {
      if (forceKillTimer) clearTimeout(forceKillTimer);
      forceKillTimer = undefined;
    };
    const onAbort = () => terminate();
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer | string) => output.append('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer | string) => output.append('stderr', chunk));
    // Always close the pipe: programs reading until EOF must not hang. EPIPE is
    // expected when a command exits without consuming its input.
    child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') terminate();
    });
    child.stdin?.end(stdin ?? '', UTF8);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearForceKillTimer();
      signal?.removeEventListener('abort', onAbort);
      reject(new FileToolRejected(`Could not run ${selectedShell.name} (${selectedShell.executable}): ${error.message}`));
    });
    child.once('close', (exitCode, exitSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearForceKillTimer();
      signal?.removeEventListener('abort', onAbort);
      const cancelled = signal?.aborted === true;
      resolve({
        ok: !cancelled && !timedOut && exitCode === 0,
        command,
        cwd,
        shell: selectedShell.name,
        platform: selectedShell.platform,
        exitCode,
        signal: exitSignal,
        stdout: output.stdout(),
        stderr: output.stderr(),
        timedOut,
        truncated: output.truncated,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function normalizeCommand(command: string): string {
  if (typeof command !== 'string' || !command.trim()) throw new FileToolRejected('Command is required.');
  const value = command.trim();
  if (value.length > MAX_TERMINAL_COMMAND_CHARS) throw new FileToolRejected('Command is too long.');
  return value;
}

function resolveCwd(requestedCwd: string | undefined, workspaceRoot: string): string {
  const value = requestedCwd?.trim() ?? '';
  if (value.length > MAX_TERMINAL_CWD_CHARS) throw new FileToolRejected('Working directory is too long.');
  return path.resolve(workspaceRoot.trim() || process.cwd(), value || '.');
}

function boundedNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new FileToolRejected(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

class BoundedOutput {
  private readonly values: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] };
  private usedBytes = 0;
  truncated = false;

  constructor(private readonly maximumBytes: number, private readonly encoding: string) {}

  append(stream: 'stdout' | 'stderr', chunk: Buffer | string): void {
    const remaining = this.maximumBytes - this.usedBytes;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, UTF8);
    const accepted = buffer.subarray(0, remaining);
    this.values[stream].push(accepted);
    this.usedBytes += accepted.byteLength;
    if (accepted.byteLength < buffer.byteLength) this.truncated = true;
  }

  stdout(): string {
    return this.decode('stdout');
  }

  stderr(): string {
    return this.decode('stderr');
  }

  private decode(stream: 'stdout' | 'stderr'): string {
    // Decode only after combining chunks: a UTF-8 character can span events.
    // A byte-limited result may end midway through a character; omit that tail.
    return new TextDecoder(this.encoding).decode(Buffer.concat(this.values[stream]), { stream: this.truncated });
  }
}
