/**
 * One of the client's observables, held as state for as long as the calling
 * component lives. Subscribed at once, as a component's `$store` is, so the
 * first read already has what the client holds.
 */
export function observed<T>(source: {
  subscribe(next: (value: T) => void): { unsubscribe(): void };
}): { readonly current: T } {
  let current = $state.raw<T>(undefined as T);
  const watching = source.subscribe((value) => {
    current = value;
  });
  $effect(() => () => watching.unsubscribe());
  return {
    get current() {
      return current;
    },
  };
}
