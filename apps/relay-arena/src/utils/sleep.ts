/** Resolves after `ms`, or at once when `signal` aborts — never rejects. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) return resolve();

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", wake);
      resolve();
    }, ms);

    function wake(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", wake, { once: true });
  });
}
