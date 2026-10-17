import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileToolRejected, matchesFileGlob, resolveSearchPath, scanFileEntries } from './file-access.ts';
import { MAX_FILE_TOOL_RETURNED_BYTES } from '../infra/limits.ts';

export interface ContentSearchOptions {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  contextLines?: number;
  maxDepth?: number;
}

/** Search only approved, bounded discovery results. No shell or interpolated commands. */
export async function searchFileContents(options: ContentSearchOptions, signal?: AbortSignal) {
  if (signal?.aborted) throw new FileToolRejected('Search cancelled.');
  if (!options.pattern || options.pattern.length > 4096) throw new FileToolRejected('Pattern must contain 1–4096 characters.');
  const maximum = options.maxResults ?? 100;
  const context = options.contextLines ?? 0;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 500) throw new FileToolRejected('maxResults must be between 1 and 500.');
  if (!Number.isInteger(context) || context < 0 || context > 10) throw new FileToolRejected('contextLines must be between 0 and 10.');
  const target = await resolveSearchPath(options.path ?? '.');
  const directory = (await fs.lstat(target)).isDirectory();
  const root = directory ? target : path.dirname(target);
  const discovered = directory ? await scanFileEntries({
    path: target, depth: options.maxDepth ?? 12, maximum: 1000, signal,
    matches: (relative, name) => (!options.include || matchesFileGlob(relative, options.include) || matchesFileGlob(name, options.include))
      && (!options.exclude || !(matchesFileGlob(relative, options.exclude) || matchesFileGlob(name, options.exclude))),
  }) : { entries: [{ path: path.basename(target), type: 'file' }] };
  const files = discovered.entries.filter((entry) => entry.type === 'file').map((entry) => entry.path);
  const results: { path: string; line: number; text: string; context?: true }[] = [];
  let reason: string | undefined = 'reason' in discovered ? discovered.reason : undefined;
  let count = 0;
  let bytes = 0;
  const deadline = Date.now() + 25_000;
  let stopped = false;
  for (let index = 0; index < files.length && !stopped; index += 16) {
    if (signal?.aborted) throw new FileToolRejected('Search cancelled.');
    if (Date.now() >= deadline) { reason = 'time-limit'; break; }
    const batch = files.slice(index, index + 16);
    // Revalidate before opening: a path may have changed since discovery.
    for (const file of batch) await resolveSearchPath(path.join(root, file));
    await new Promise<void>((resolve, reject) => {
      const args = ['--json', '--no-config', '--sort=path', '--color=never', '--max-filesize=10M', '--context=' + context];
      if (!options.caseSensitive) args.push('-i');
      args.push('--', options.pattern, ...batch);
      const child = spawn('rg', args, { cwd: root, shell: false, windowsHide: true });
      let pending = '';
      let stderr = '';
      let failure: Error | undefined;
      const stop = (why: string) => { reason = why; stopped = true; child.kill(); };
      const timer = setTimeout(() => stop('time-limit'), Math.max(1, deadline - Date.now()));
      const abort = () => { failure = new FileToolRejected('Search cancelled.'); child.kill(); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (stopped || failure) return;
        pending += chunk;
        // A single very long line must not accumulate unbounded JSON.
        if (Buffer.byteLength(pending) > 1_000_000) { stop('output-limit'); return; }
        let newline: number;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          try {
            const event = JSON.parse(line);
            if (event.type !== 'match' && event.type !== 'context') continue;
            if (event.type === 'match' && count >= maximum) { stop('result-limit'); break; }
            const row = { path: String(event.data.path.text).replaceAll('\\', '/'), line: event.data.line_number as number,
              text: String(event.data.lines.text ?? '').replace(/\r?\n$/, ''), ...(event.type === 'context' ? { context: true as const } : {}) };
            const size = Buffer.byteLength(JSON.stringify(row));
            if (bytes + size > MAX_FILE_TOOL_RETURNED_BYTES - 1500) { stop('output-limit'); break; }
            bytes += size; results.push(row);
            if (event.type === 'match') count++;
          } catch { failure = new FileToolRejected('Invalid search output.'); child.kill(); break; }
        }
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(0, 2000); });
      child.once('error', (error) => { failure = new FileToolRejected(`Could not run ripgrep: ${error.message}`); });
      child.once('close', (code) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (!stopped && code !== 0 && code !== 1) reject(new FileToolRejected(stderr || 'Content search failed.'));
        else resolve();
      });
    });
  }
  return { results, ...(reason ? { truncated: true, reason } : {}) };
}
