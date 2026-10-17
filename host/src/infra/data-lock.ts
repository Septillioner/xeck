import { createMutex } from './mutex.ts';

/**
 * One lock for every stored host record.
 *
 * Settings routes, session plans and the stores that read them serialize through
 * this mutex, so a write never reads a half-written file. Callers must not take a
 * second lock while holding it: the session store waits on this lock from inside
 * its own critical section while it measures context parts.
 */
export const dataLock = createMutex();