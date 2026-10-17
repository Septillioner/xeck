import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isMissingFile } from './fs-safe.ts';

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text) as T;
  } catch (error) {
    if (isMissingFile(error)) return fallback;
    throw error;
  }
}

export async function writeJson(filePath: string, value: unknown, mode?: number): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (mode === undefined) return;
  try {
    await chmod(filePath, mode);
  } catch {
    // Windows only toggles the read-only bit; the write still succeeded.
  }
}
