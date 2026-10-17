import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_FILE_TOOL_MAX_DEPTH,
  DEFAULT_FILE_TOOL_MAX_ENTRIES,
  DEFAULT_FILE_TOOL_MAX_RESULTS,
  DEFAULT_FILE_TOOL_LINE_WINDOW,
  MAX_FILE_TOOL_MAX_DEPTH,
  MAX_FILE_TOOL_MAX_ENTRIES,
  MAX_FILE_TOOL_MAX_RESULTS,
  MAX_FILE_TOOL_DIFF_BYTES,
  MAX_FILE_TOOL_DIFF_LINES,
  MAX_FILE_TOOL_PATH_CHARS,
  MAX_FILE_TOOL_QUERY_CHARS,
  MAX_FILE_TOOL_READ_BYTES,
  MAX_FILE_TOOL_RETURNED_BYTES,
} from '../infra/limits.ts';
import { readSettings } from '../stores/settings-store.ts';
import type { FileChange } from '../../../shared/types.ts';

const UTF8 = 'utf8';

export class FileToolRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileToolRejected';
  }
}

interface FileToolOptions {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface FileReadResult {
  path: string;
  content: string;
  bytes: number;
  totalBytes: number;
  hash: string;
  truncated: boolean;
  startLine?: number;
  endLine?: number;
}

export interface FileWriteResult {
  ok: true;
  path: string;
  bytes: number;
  hash: string;
  change: FileChange;
}

export interface FileEntry {
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
}

export interface FileInfo {
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  modifiedAt: string;
  createdAt: string;
  mode: number;
  symbolicLink: boolean;
}

export interface FileOperationResult {
  ok: true;
  path: string;
  created?: boolean;
  removed?: boolean;
  overwritten?: boolean;
  change: FileChange;
}

export async function readFileTool(options: FileToolOptions): Promise<FileReadResult> {
  const filePath = await resolveFilePath(options.path, false);
  const buffer = await readBoundedFile(filePath);
  const range = readRange(options);
  const settings = await readSettings();
  const root = path.resolve(settings.workspaceRoot.trim() || process.cwd());
  return readLines(path.relative(root, filePath).split(path.sep).join('/'), buffer, range.startLine, range.endLine, range.windowed);
}

export async function replaceFileLines(
  fileName: string,
  startLine: number,
  endLine: number,
  replacement: string,
  expectedHash?: string,
): Promise<FileWriteResult> {
  const filePath = await resolveFilePath(fileName, false);
  const original = await fs.readFile(filePath);
  const currentHash = hash(original);
  if (expectedHash && expectedHash !== currentHash) {
    throw new FileToolRejected('File changed since it was read.');
  }
  const text = original.toString(UTF8);
  const lines = splitLines(text);
  validateLineRange(startLine, endLine, lines.length);
  const newline = detectNewline(text);
  const nextLines = [...lines.slice(0, startLine - 1), ...replacement.split(/\r\n|\n/), ...lines.slice(endLine)];
  const next = nextLines.join(newline);
  return writeResolvedFile(filePath, Buffer.from(next, UTF8), 'replace', text);
}

export async function writeFileTool(fileName: string, content: string): Promise<FileWriteResult> {
  const filePath = await resolveFilePath(fileName, true);
  const previous = await readTextIfFile(filePath);
  return writeResolvedFile(filePath, Buffer.from(content, UTF8), 'write', previous);
}

export async function createDirectoryTool(directoryName: string, recursive = true): Promise<FileOperationResult> {
  const directoryPath = await resolveFilePath(directoryName, true);
  const existing = await lstatSafe(directoryPath);
  if (existing) {
    if (!existing.isDirectory()) throw new FileToolRejected('Path already exists and is not a directory.');
    return {
      ok: true,
      path: directoryPath,
      created: false,
      change: { operation: 'create-directory', path: directoryPath, created: false },
    };
  }
  await fs.mkdir(directoryPath, { recursive });
  return {
    ok: true,
    path: directoryPath,
    created: true,
    change: { operation: 'create-directory', path: directoryPath, created: true },
  };
}

export async function listDirectoryTool(directoryName = '', includeSize = false, depth = 0, maxEntries?: number) {
  return scanFileEntries({ path: directoryName || '.', depth, maximum: maxEntries, includeSize });
}

export async function moveFileTool(
  sourceName: string,
  destinationName: string,
  overwrite = false,
): Promise<FileOperationResult> {
  const sourcePath = await resolveFilePath(sourceName, false);
  const destinationPath = await resolveFilePath(destinationName, true);
  const source = await fs.lstat(sourcePath);
  if (!source.isFile()) throw new FileToolRejected('Source must be a regular file.');
  const destination = await lstatSafe(destinationPath);
  if (destination?.isDirectory()) throw new FileToolRejected('Destination is a directory.');
  if (destination && !overwrite) throw new FileToolRejected('Destination already exists.');
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  if (destination) await fs.rm(destinationPath);
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (isCrossDeviceError(error)) throw new FileToolRejected('Source and destination are on different filesystems.');
    throw error;
  }
  return {
    ok: true,
    path: destinationPath,
    overwritten: Boolean(destination),
    change: {
      operation: 'move',
      path: sourcePath,
      destination: destinationPath,
      overwritten: Boolean(destination),
    },
  };
}

export async function deleteFileTool(fileName: string, recursive = false): Promise<FileOperationResult> {
  const filePath = await resolveFilePath(fileName, false);
  const stat = await fs.lstat(filePath);
  const workspaceRoot = path.resolve((await readSettings()).workspaceRoot.trim() || process.cwd());
  if (path.resolve(filePath) === workspaceRoot) throw new FileToolRejected('The workspace root cannot be deleted.');
  if (stat.isDirectory() && !recursive) {
    const children = await fs.readdir(filePath);
    if (children.length > 0) throw new FileToolRejected('Directory is not empty; set recursive to true.');
  }
  await fs.rm(filePath, { recursive: stat.isDirectory() && recursive, force: false });
  return {
    ok: true,
    path: filePath,
    removed: true,
    change: { operation: 'delete', path: filePath, recursive },
  };
}

export async function getFileInfoTool(fileName: string): Promise<FileInfo> {
  const filePath = await resolveFilePath(fileName, false);
  return toFileInfo(filePath, await fs.lstat(filePath));
}

export async function searchFilesTool(options: {
  query: string; path?: string; recursive?: boolean; maxResults?: number; maxDepth?: number;
}) {
  const query = validateQuery(options.query);
  return scanFileEntries({
    path: options.path, depth: options.recursive === false ? 0 : options.maxDepth ?? DEFAULT_FILE_TOOL_MAX_DEPTH,
    maximum: boundedInteger(options.maxResults, 1, MAX_FILE_TOOL_MAX_RESULTS, DEFAULT_FILE_TOOL_MAX_RESULTS, 'maxResults'),
    matches: (relative, name) => /[*?{[]/.test(query) ? matchesFileGlob(relative.toLowerCase(), query) || matchesFileGlob(name.toLowerCase(), query) : name.toLowerCase().includes(query),
  });
}

/** Shared discovery budget for listing, name search and content search. */
export async function scanFileEntries(options: {
  path?: string; depth?: number; maximum?: number; includeSize?: boolean;
  matches?: (relative: string, name: string) => boolean; signal?: AbortSignal;
}) {
  const root = await resolveSearchPath(options.path ?? '.');
  const depth = boundedInteger(options.depth, 0, MAX_FILE_TOOL_MAX_DEPTH, 0, 'depth');
  const maximum = boundedInteger(options.maximum, 1, MAX_FILE_TOOL_MAX_ENTRIES, DEFAULT_FILE_TOOL_MAX_ENTRIES, 'maximum');
  const entries: FileEntry[] = [];
  const deadline = Date.now() + 5_000;
  let visited = 0;
  let reason: string | undefined;
  async function walk(directory: string, level: number): Promise<void> {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (options.signal?.aborted) throw new FileToolRejected('Search cancelled.');
      if (++visited > 10_000 || Date.now() > deadline) { reason = 'scan-limit'; return; }
      if (child.isSymbolicLink() || excludedFileName(child.name)) continue;
      const absolute = path.join(directory, child.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!options.matches || options.matches(relative, child.name)) {
        if (entries.length >= maximum) { reason = 'result-limit'; return; }
        entries.push({ path: relative, type: entryType(child), ...(options.includeSize && child.isFile() ? { size: (await fs.lstat(absolute)).size } : {}) });
      }
      if (child.isDirectory() && level < depth) await walk(absolute, level + 1);
      if (reason) return;
    }
  }
  await walk(root, 0);
  return { entries, ...(reason ? { truncated: true as const, reason } : {}) };
}

export function matchesFileGlob(value: string, glob: string): boolean {
  return path.matchesGlob(value.replaceAll('\\', '/'), glob.replaceAll('\\', '/'));
}

export function excludedFileName(name: string): boolean {
  return /^(?:\.git|node_modules|dist|build|coverage|\.next|\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/i.test(name)
    || /\.(?:pem|key|p12|pfx|crt|cer)$/i.test(name);
}

/** Reject explicit excluded paths and symlink components, even with full access. */
export async function resolveSearchPath(input: string): Promise<string> {
  const resolved = await resolveFilePath(input, false);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    if (excludedFileName(part)) throw new FileToolRejected('Path is excluded from file discovery.');
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new FileToolRejected('File discovery does not follow symlinks.');
  }
  return resolved;
}

async function resolveFilePath(fileName: string, allowMissing: boolean): Promise<string> {
  const settings = await readSettings();
  const input = fileName.trim();
  if (!input) throw new FileToolRejected('File path is required.');
  if (input.length > MAX_FILE_TOOL_PATH_CHARS) throw new FileToolRejected('File path is too long.');
  const workspaceRoot = path.resolve(settings.workspaceRoot.trim() || process.cwd());
  const requested = path.resolve(workspaceRoot, input);
  if (settings.fullFileAccess) return requested;

  const root = await realPath(workspaceRoot);
  const target = await realPathForCheck(requested, allowMissing);
  if (!isWithin(root, target)) throw new FileToolRejected('File path is outside the workspace root.');
  return requested;
}


async function readBoundedFile(filePath: string): Promise<Buffer> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new FileToolRejected('Path is not a file.');
  if (stat.size > MAX_FILE_TOOL_READ_BYTES) throw new FileToolRejected('File is too large to read.');
  return fs.readFile(filePath);
}

function readRange(options: FileToolOptions): { startLine: number; endLine: number; windowed: boolean } {
  const startLine = options.startLine ?? 1;
  const windowed = options.endLine === undefined;
  const endLine = options.endLine ?? startLine + DEFAULT_FILE_TOOL_LINE_WINDOW - 1;
  validateLineRange(startLine, endLine);
  return { startLine, endLine, windowed };
}

function readLines(filePath: string, buffer: Buffer, startLine: number, endLine: number, windowed: boolean): FileReadResult {
  const text = buffer.toString(UTF8);
  const lines = splitLines(text);
  if (startLine > lines.length || (!windowed && endLine > lines.length)) {
    throw new FileToolRejected('Line range is outside the file.');
  }
  const actualEndLine = Math.min(endLine, lines.length);
  const content = lines.slice(startLine - 1, actualEndLine).join(detectNewline(text));
  const bytes = Buffer.byteLength(content, UTF8);
  let capped = truncateUtf8(content, MAX_FILE_TOOL_RETURNED_BYTES);
  const result = {
    path: filePath,
    content: capped,
    bytes: Buffer.byteLength(capped, UTF8),
    totalBytes: buffer.byteLength,
    hash: hash(buffer),
    truncated: bytes > Buffer.byteLength(capped, UTF8) || actualEndLine < lines.length,
    startLine,
    endLine: actualEndLine,
  };
  while (Buffer.byteLength(JSON.stringify(result), UTF8) > MAX_FILE_TOOL_RETURNED_BYTES) {
    capped = truncateUtf8(capped, Math.floor(Buffer.byteLength(capped, UTF8) * 0.9));
    result.content = capped;
    result.bytes = Buffer.byteLength(capped, UTF8);
    result.truncated = true;
  }
  return result;
}

async function writeResolvedFile(
  filePath: string,
  content: Buffer,
  operation: 'write' | 'replace',
  previousText: string | null,
): Promise<FileWriteResult> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx' });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  const nextText = content.toString(UTF8);
  return {
    ok: true,
    path: filePath,
    bytes: content.byteLength,
    hash: hash(content),
    change: createTextChange(operation, filePath, previousText ?? '', nextText),
  };
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n/);
}

function detectNewline(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function validateLineRange(startLine: number, endLine: number, lineCount = Number.POSITIVE_INFINITY): void {
  integerAtLeast(startLine, 1, 'Start line');
  integerAtLeast(endLine, startLine, 'End line');
  if (endLine > lineCount) throw new FileToolRejected('Line range is outside the file.');
}

function integerAtLeast(value: number | undefined, minimum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new FileToolRejected(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function hash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function truncateUtf8(value: string, byteLimit: number): string {
  const buffer = Buffer.from(value, UTF8);
  if (buffer.byteLength <= byteLimit) return value;
  let end = byteLimit;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString(UTF8);
}

async function readTextIfFile(filePath: string): Promise<string | null> {
  const stat = await lstatSafe(filePath);
  if (!stat) return null;
  if (!stat.isFile()) throw new FileToolRejected('Path already exists and is not a regular file.');
  return fs.readFile(filePath, UTF8);
}

function createTextChange(
  operation: 'write' | 'replace',
  filePath: string,
  before: string,
  after: string,
): FileChange {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const prefix = commonPrefixLength(beforeLines, afterLines);
  const suffix = commonSuffixLength(beforeLines, afterLines, prefix);
  const beforeStart = Math.max(0, prefix - 3);
  const afterStart = Math.max(0, prefix - 3);
  const beforeEnd = Math.min(beforeLines.length - suffix, prefix + MAX_FILE_TOOL_DIFF_LINES);
  const afterEnd = Math.min(afterLines.length - suffix, prefix + MAX_FILE_TOOL_DIFF_LINES);
  const diffLines = [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    ...beforeLines.slice(beforeStart, beforeEnd).map((line) => `-${line}`),
    ...afterLines.slice(afterStart, afterEnd).map((line) => `+${line}`),
  ];
  const fullDiff = diffLines.join('\n');
  const diff = truncateUtf8(fullDiff, MAX_FILE_TOOL_DIFF_BYTES);
  return {
    operation,
    path: filePath,
    diff,
    addedLines: Math.max(0, afterLines.length - prefix - suffix),
    removedLines: Math.max(0, beforeLines.length - prefix - suffix),
    truncated: diff.length !== fullDiff.length || beforeEnd < beforeLines.length - suffix || afterEnd < afterLines.length - suffix,
  };
}

function commonPrefixLength(left: string[], right: string[]): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index++;
  return index;
}

function commonSuffixLength(left: string[], right: string[], prefix: number): number {
  let count = 0;
  while (
    count < left.length - prefix &&
    count < right.length - prefix &&
    left[left.length - count - 1] === right[right.length - count - 1]
  ) {
    count++;
  }
  return count;
}

async function realPath(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    throw new FileToolRejected('Workspace root does not exist.');
  }
}

async function realPathForCheck(filePath: string, allowMissing: boolean): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    if (!allowMissing) throw new FileToolRejected('File does not exist.');
    const parent = path.dirname(filePath);
    const parentRealPath = await realPathForCheck(parent, true);
    return path.join(parentRealPath, path.basename(filePath));
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function toFileInfo(filePath: string, stat: import('node:fs').Stats): FileInfo {
  return {
    path: filePath,
    type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'other',
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    createdAt: stat.birthtime.toISOString(),
    mode: stat.mode,
    symbolicLink: stat.isSymbolicLink(),
  };
}

function entryType(entry: import('node:fs').Dirent): FileEntry['type'] {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  if (entry.isSymbolicLink()) return 'symlink';
  return 'other';
}

function validateQuery(value: string): string {
  const query = value.trim().toLowerCase();
  if (!query) throw new FileToolRejected('Search query is required.');
  if (query.length > MAX_FILE_TOOL_QUERY_CHARS) throw new FileToolRejected('Search query is too long.');
  return query;
}

function boundedInteger(
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

async function lstatSafe(filePath: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (isMissingError(error)) return null;
    throw error;
  }
}

function isMissingError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function isCrossDeviceError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EXDEV');
}
