import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDirectoryTool,
  deleteFileTool,
  FileToolRejected,
  getFileInfoTool,
  listDirectoryTool,
  moveFileTool,
  readFileTool,
  replaceFileLines,
  searchFilesTool,
  writeFileTool,
} from './file-access.ts';
import { builtinMcpTools, listBuiltinMcpTools } from '../agent/tools/builtin/connection.ts';
import { listPendingDialogs, resolveDialog } from '../agent/runtime/events/dialogs.ts';
import { settingsPath } from '../infra/data-dir.ts';
import { writeJson } from '../infra/json-file.ts';

test('file tools enforce bounded reads and line ranges', async (t) => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-file-tools-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
  const filePath = path.join(workspace, 'sample.txt');
  await writeFile(filePath, 'one\ntwo\nüç\nfour\n', 'utf8');

  try {
    await t.test('reads 1-based inclusive lines', async () => {
      const lines = await readFileTool({ path: 'sample.txt', startLine: 2, endLine: 3 });
      assert.equal(lines.content, 'two\nüç');
      assert.equal(lines.startLine, 2);
      assert.equal(lines.endLine, 3);

    });

    await t.test('caps returned UTF-8 content', async () => {
      await writeFile(filePath, 'a'.repeat(25_000), 'utf8');
      const result = await readFileTool({ path: 'sample.txt', startLine: 1, endLine: 1 });
      assert.ok(result.bytes > 0 && result.bytes <= 20_000);
      assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 20_000);
      assert.equal(result.truncated, true);
    });

    await t.test('rejects ranges outside the file', async () => {
      await assert.rejects(
        readFileTool({ path: 'sample.txt', startLine: 2, endLine: 3 }),
        (error: unknown) => error instanceof FileToolRejected,
      );
    });
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('file tools protect the workspace and support explicit full access', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-file-access-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  const outside = path.join(temporaryDirectory, 'outside.txt');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeFile(outside, 'outside', 'utf8');

  try {
    await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
    await assert.rejects(readFileTool({ path: '../outside.txt' }), FileToolRejected);

    await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: true });
    const result = await readFileTool({ path: outside });
    assert.equal(result.content, 'outside');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('replace_lines uses the complete file hash and preserves CRLF', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-file-edit-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
  const filePath = path.join(workspace, 'edit.txt');
  const original = 'one\r\ntwo\r\nthree\r\n';
  await writeFile(filePath, original, 'utf8');
  const expectedHash = createHash('sha256').update(original, 'utf8').digest('hex');

  try {
    const result = await replaceFileLines('edit.txt', 2, 2, 'changed', expectedHash);
    assert.equal(result.ok, true);
    assert.equal(result.change.operation, 'replace');
    assert.match(result.change.diff ?? '', /-two/);
    assert.match(result.change.diff ?? '', /\+changed/);
    assert.equal(await readFile(filePath, 'utf8'), 'one\r\nchanged\r\nthree\r\n');

    await assert.rejects(
      replaceFileLines('edit.txt', 1, 1, 'blocked', expectedHash),
      (error: unknown) => error instanceof FileToolRejected && error.message.includes('changed'),
    );
    assert.equal(await readFile(filePath, 'utf8'), 'one\r\nchanged\r\nthree\r\n');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('write_file creates parents and returns metadata only', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-file-write-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });

  try {
    const result = await writeFileTool('nested/file.txt', 'merhaba');
    assert.deepEqual(Object.keys(result).sort(), ['bytes', 'change', 'hash', 'ok', 'path']);
    assert.equal(result.bytes, Buffer.byteLength('merhaba', 'utf8'));
    assert.equal(result.change.operation, 'write');
    assert.equal(await readFile(path.join(workspace, 'nested/file.txt'), 'utf8'), 'merhaba');
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('restricted reads do not follow symlinks outside the workspace', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-file-link-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  const outside = path.join(temporaryDirectory, 'outside.txt');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeFile(outside, 'outside', 'utf8');

  try {
    await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
    try {
      await symlink(outside, path.join(workspace, 'link.txt'));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await assert.rejects(readFileTool({ path: 'link.txt' }), FileToolRejected);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('directory tools expose bounded deterministic metadata', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-directory-tools-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(path.join(workspace, 'nested'), { recursive: true });
  await writeFile(path.join(workspace, 'b.txt'), 'bb', 'utf8');
  await writeFile(path.join(workspace, 'a.txt'), 'a', 'utf8');
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });

  try {
    const listed = await listDirectoryTool('', false);
    assert.deepEqual(listed.entries.map((entry) => entry.path), ['a.txt', 'b.txt', 'nested']);
    assert.equal(listed.entries.find((entry) => entry.path === 'a.txt')?.size, undefined);

    const sized = await listDirectoryTool('', true);
    assert.equal(sized.entries.find((entry) => entry.path === 'a.txt')?.size, 1);
    assert.equal(sized.entries.find((entry) => entry.path === 'nested')?.size, undefined);

    const info = await getFileInfoTool('a.txt');
    assert.equal(info.type, 'file');
    assert.equal(info.size, 1);

    const tree = await listDirectoryTool('', false, 1);
    assert.ok(tree.entries.some((entry) => entry.path === 'nested'));
    const search = await searchFilesTool({ query: '.TXT', maxDepth: 1 });
    assert.deepEqual(search.entries.map((entry) => entry.path), ['a.txt', 'b.txt']);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('create, move, and delete enforce safe file semantics', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-file-actions-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });

  try {
    const created = await createDirectoryTool('nested/deeper');
    assert.equal(created.created, true);
    await writeFile(path.join(workspace, 'source.txt'), 'source', 'utf8');
    const moved = await moveFileTool('source.txt', 'nested/deeper/moved.txt');
    assert.equal(moved.ok, true);
    await assert.rejects(moveFileTool('nested/deeper/moved.txt', 'nested/deeper/moved.txt'), FileToolRejected);
    await assert.rejects(deleteFileTool('nested'), FileToolRejected);
    const deleted = await deleteFileTool('nested', true);
    assert.equal(deleted.removed, true);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('builtin MCP lists the simplified file tool surface', async () => {
  const tools = await listBuiltinMcpTools();
  const names = new Set(tools.map((tool) => tool.name));
  for (const retired of ['directory_tree', 'list_directory_with_size', 'list_allowed_directories']) assert.equal(names.has(retired), false);
  for (const name of [
    'read_file',
    'replace_lines',
    'write_file',
    'delete_file',
    'create_directory',
    'list_directory',
    'move_file',
    'search_files',
    'get_file_info',
  ]) {
    assert.equal(names.has(name), true, `missing ${name}`);
  }
});

test('delete_file requires approval before changing the filesystem', async () => {
  const previousAppData = process.env.APPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'xeck-delete-approval-'));
  const workspace = path.join(temporaryDirectory, 'workspace');
  process.env.APPDATA = temporaryDirectory;
  await mkdir(workspace);
  await writeJson(settingsPath(), { workspaceRoot: workspace, fullFileAccess: false });
  await writeFile(path.join(workspace, 'reject.txt'), 'keep', 'utf8');
  await writeFile(path.join(workspace, 'approve.txt'), 'remove', 'utf8');
  const sessionId = 'delete-approval-test';

  try {
    const tools = await builtinMcpTools(new Set());
    const deleteTool = Object.values(tools).find((tool) => tool.name.endsWith('__delete_file'));
    assert.ok(deleteTool);

    const rejected = deleteTool.execute({ path: 'reject.txt' }, { sessionId });
    const rejectedDialog = await waitForDialog(sessionId);
    assert.equal(resolveDialog(rejectedDialog.id, { approved: false }, sessionId), true);
    const rejectedResult = (await rejected) as { isError?: boolean };
    assert.equal(rejectedResult.isError, true);
    assert.equal(await readFile(path.join(workspace, 'reject.txt'), 'utf8'), 'keep');

    const approved = deleteTool.execute({ path: 'approve.txt' }, { sessionId });
    const approvedDialog = await waitForDialog(sessionId);
    assert.equal(resolveDialog(approvedDialog.id, { approved: true }, sessionId), true);
    const approvedResult = (await approved) as { isError?: boolean };
    assert.equal(approvedResult.isError, false);
    await assert.rejects(readFile(path.join(workspace, 'approve.txt'), 'utf8'));
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

async function waitForDialog(sessionId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const dialog = listPendingDialogs(sessionId)[0];
    if (dialog) return dialog;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Approval dialog was not created.');
}
