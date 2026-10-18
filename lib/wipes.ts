/**
 * When each visitor's data was last wiped ("Delete my data", the TTL purge, the race's "End and wipe" via
 * lib/user.ts wipeUser). Imports await minutes of network and LLM work before they write: they note when they
 * started and check wipedSince inside their insert transaction, so a wipe that lands mid-import isn't undone
 * by the import writing the user's data back afterwards.
 *
 * In memory on purpose: an import can't outlive the process, so neither needs to the marker. No imports here,
 * so lib/google.ts, lib/microsoft.ts and lib/twin.ts can use it without a cycle through lib/user.ts.
 */
const KEEP_MS = 2 * 60 * 60_000;

const store = globalThis as unknown as { __formlyWipes?: Map<string, number> };
const wipes = (store.__formlyWipes ??= new Map());

export function markWiped(userId: string, at = Date.now()): void {
  wipes.set(userId, at);
  // Nothing in flight is older than this; keep the map from growing forever.
  for (const [id, t] of wipes) if (at - t > KEEP_MS) wipes.delete(id);
}

/** True when the user's data was wiped at or after `since` (work begun before then must not write back). */
export function wipedSince(userId: string, since: number): boolean {
  const t = wipes.get(userId);
  return t !== undefined && t >= since;
}

/** Thrown by an import whose user was wiped while it ran: nothing was saved. */
export class WipedError extends Error {
  constructor() {
    super("Your data was deleted while this import ran, so nothing was saved");
  }
}
