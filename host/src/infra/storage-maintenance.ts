let requests = 0;
let maintenance = false;

export class StorageBusyError extends Error {}

export function assertStorageAvailable(): void {
  if (maintenance) throw new StorageBusyError('Data migration is in progress. Retry shortly.');
}

/** Prevent a rename from overlapping an HTTP store operation. */
export async function withStorageRequest<T>(task: () => Promise<T>): Promise<T> {
  assertStorageAvailable();
  requests++;
  try { return await task(); } finally { requests--; }
}

export async function withStorageMaintenance<T>(isBusy: () => boolean, task: () => Promise<T>): Promise<T> {
  if (maintenance || requests || isBusy()) {
    throw new StorageBusyError('Finish active replies and other data operations before migrating.');
  }
  maintenance = true;
  try { return await task(); } finally { maintenance = false; }
}
