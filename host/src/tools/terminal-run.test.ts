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
