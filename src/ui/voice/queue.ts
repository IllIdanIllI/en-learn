/** A queued synthesis request in the worker: a press, or a background prefetch. */
export interface QueuedRequest {
  prefetch: boolean;
}

/** The index of the request to run next: the first press in queue order, else the first prefetch; -1 when the queue is empty. */
export function nextRequest(pending: readonly QueuedRequest[]): number {
  const press = pending.findIndex((r) => !r.prefetch);
  if (press !== -1) return press;
  return pending.length > 0 ? 0 : -1;
}
