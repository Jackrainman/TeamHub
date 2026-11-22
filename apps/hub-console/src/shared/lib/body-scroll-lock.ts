let lockCount = 0;
let previousOverflow = '';

/**
 * Locks the page behind a modal. Nested modals share one lock and the final
 * release restores the inline value that was present before the first lock.
 */
export function acquireBodyScrollLock(body: HTMLElement = document.body): () => void {
  if (lockCount === 0) {
    previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) body.style.overflow = previousOverflow;
  };
}
