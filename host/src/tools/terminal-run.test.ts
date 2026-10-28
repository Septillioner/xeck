import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { settingsPath } from '../infra/data-dir.ts';
import { FileToolRejected } from './file-access.ts';
import { writeJson } from '../infra/json-file.ts';
import { runCommandTool } from './terminal-run.ts';

const NODE_COMMAND = JSON.stringify(process.execPath);

test('terminal commands require full file access and use the configured cwd', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-terminal-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await mkdir(path.join(workspace, 'workspace'));

  try {
    await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
    await assert.rejects(runCommandTool(`${NODE_COMMAND} -e "process.stdout.write('blocked')"`, undefined, undefined, undefined), FileToolRejected);

    await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: true });
    const result = await runCommandTool(
      `${NODE_COMMAND} -e "process.stdout.write(process.cwd())"`,
      'workspace',
      undefined,
      undefined,
    );
    assert.equal(result.ok, true);
    assert.equal(result.cwd, path.join(workspace, 'workspace'));
    assert.equal(result.stdout, result.cwd);
    assert.equal(result.platform, process.platform);
    assert.equal(result.shell, process.platform === 'win32' ? 'cmd' : 'sh');
    const explicit = await runCommandTool(
      process.platform === 'win32' ? "[Console]::Write('Türkçe a b')" : "printf '%s' 'Türkçe a b'",
      undefined, undefined, undefined, undefined,
      process.platform === 'win32' ? 'powershell' : 'sh',
    );
    assert.equal(explicit.ok, true);
    assert.equal(explicit.stdout, 'Türkçe a b');
    await assert.rejects(runCommandTool('echo test', undefined, undefined, undefined, undefined, 'invalid'), /Unsupported shell/);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('terminal commands collect bounded output and non-zero status', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-terminal-output-'));
  process.env.APPDATA = temporaryDirectory;
  try {
    await writeJson(settingsPath(), { workspaceRoot: temporaryDirectory, fullFileAccess: true });
    const output = await runCommandTool(
      `${NODE_COMMAND} -e "process.stdout.write('1234567890'); process.stderr.write('error'); process.exit(3)"`,
      undefined,
      undefined,
      5,
    );
    assert.equal(output.ok, false);
    assert.equal(output.exitCode, 3);
    assert.equal(output.truncated, true);
    assert.ok(Buffer.byteLength(output.stdout, 'utf8') + Buffer.byteLength(output.stderr, 'utf8') <= 5);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('terminal input and environment overrides are scoped to one invocation', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-terminal-input-'));
  process.env.APPDATA = directory;
  try {
    await writeJson(settingsPath(), { workspaceRoot: directory, fullFileAccess: true });
    const script = "let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>data+=s);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({input:data,value:process.env.XECK_TEST_VALUE,removed:process.env.APPDATA})))";
    const command = `${NODE_COMMAND} -e "${script}"`;
    const input = 'Türkçe $value & | "quotes"\nsecond line';
    const value = 'literal & echo injected';
    const result = await runCommandTool(command, undefined, undefined, undefined, undefined, undefined, {
      stdin: input, env: { XECK_TEST_VALUE: value, APPDATA: null },
    });
    assert.equal(result.ok, true, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { input, value });
    assert.equal(process.env.APPDATA, directory);
    assert.equal(process.env.XECK_TEST_VALUE, undefined);
    const eof = await runCommandTool(command, undefined, undefined, undefined);
    assert.equal(JSON.parse(eof.stdout).input, '');
    await assert.rejects(runCommandTool(command, undefined, undefined, undefined, undefined, undefined, { env: { 'bad=name': 'x' } }), /Invalid environment/);
    await assert.rejects(runCommandTool(command, undefined, undefined, undefined, undefined, undefined, { stdin: 'x'.repeat(1_000_001) }), /stdin/);
    if (process.platform === 'win32') {
      const ps = await runCommandTool('[Console]::Write([Console]::In.ReadToEnd())', undefined, undefined, undefined, undefined, 'powershell', { stdin: input });
      assert.equal(ps.ok, true, ps.stderr);
      assert.equal(ps.stdout, input);
      const failed = await runCommandTool(`& ${NODE_COMMAND} -e 'process.exit(7)'`, undefined, undefined, undefined, undefined, 'powershell');
      assert.equal(failed.ok, false);
      assert.equal(failed.exitCode, 7);
      const error = await runCommandTool("throw 'failure'", undefined, undefined, undefined, undefined, 'powershell');
      assert.equal(error.ok, false);
      const unicode = await runCommandTool('cmd /u /c echo Türkçe', undefined, undefined, undefined, undefined, 'cmd', { outputEncoding: 'utf-16le' });
      assert.equal(unicode.stdout.trim(), 'Türkçe');
    }
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});

test('terminal UTF-8 output survives chunk boundaries and byte truncation', async () => {
  const previousAppData = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-terminal-utf8-'));
  process.env.APPDATA = directory;
  try {
    await writeJson(settingsPath(), { workspaceRoot: directory, fullFileAccess: true });
    const command = `${NODE_COMMAND} -e "process.stdout.write(Buffer.from([0xc4]));setTimeout(()=>process.stdout.write(Buffer.from([0x9f])),40)"`;
    const result = await runCommandTool(command, undefined, undefined, undefined);
    assert.equal(result.stdout, 'ğ');
    const truncated = await runCommandTool(command, undefined, undefined, 1);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.stdout, '');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(directory, { recursive: true, force: true });
  }
});

test('terminal commands time out and respond to abort signals', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-terminal-timeout-'));
  process.env.APPDATA = temporaryDirectory;
  try {
    await writeJson(settingsPath(), { workspaceRoot: temporaryDirectory, fullFileAccess: true });
    const timeout = await runCommandTool(`${NODE_COMMAND} -e "setTimeout(() => {}, 1000)"`, undefined, 30, undefined);
    assert.equal(timeout.timedOut, true);
    assert.equal(timeout.ok, false);

    const controller = new AbortController();
    const pending = runCommandTool(`${NODE_COMMAND} -e "setTimeout(() => {}, 1000)"`, undefined, 10_000, undefined, controller.signal);
    controller.abort();
    await assert.rejects(pending, FileToolRejected);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('terminal abort terminates nested command processes', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-terminal-tree-'));
  const readyFile = path.join(temporaryDirectory, 'child-started');
  process.env.APPDATA = temporaryDirectory;
  const controller = new AbortController();
  let pending: ReturnType<typeof runCommandTool> | undefined;

  try {
    await writeJson(settingsPath(), { workspaceRoot: temporaryDirectory, fullFileAccess: true });
    const script = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: 'inherit' });",
      `fs.writeFileSync(${JSON.stringify(readyFile)}, 'ready');`,
      'setTimeout(() => {}, 8000);',
    ].join('');
    const encodedScript = Buffer.from(script).toString('base64');
    const command = `${NODE_COMMAND} -e "eval(Buffer.from('${encodedScript}', 'base64').toString())"`;
    pending = runCommandTool(command, undefined, 10_000, undefined, controller.signal);

    let childStarted = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        await access(readyFile);
        childStarted = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.equal(childStarted, true, 'the nested process should start before Abort');

    controller.abort();
    const result = await Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    assert.ok(result, 'Abort should settle the terminal call promptly');
    assert.equal(result.ok, false);
  } finally {
    controller.abort();
    if (pending) {
      await Promise.race([
        pending.then(() => undefined, () => undefined),
        new Promise<void>((resolve) => {
          const cleanup = setTimeout(resolve, 1000);
          cleanup.unref();
        }),
      ]);
    }
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
