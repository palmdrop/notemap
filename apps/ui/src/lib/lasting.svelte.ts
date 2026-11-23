/**
 * What `read` last answered other than `undefined`. A page being left is
 * handed the next page's data before it is taken down, so a parameter it was
 * opened on reads as missing for that moment.
 */
export function lasting<T>(read: () => T | undefined): {
  readonly current: T | undefined;
} {
  let last: T | undefined;
  const current = $derived.by(() => {
    const now = read();
    if (now !== undefined) last = now;
    return last;
  });
  return {
    get current() {
      return current;
    },
  };
}
