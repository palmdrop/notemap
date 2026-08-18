type Source<T> = {
  subscribe: (next: (value: T) => void) => { unsubscribe: () => void };
};

/** What an observable holds now. Structural, so the suite imports no rxjs. */
export function read<T>(source: Source<T>): T {
  let seen: T | undefined;
  source
    .subscribe((value) => {
      seen = value;
    })
    .unsubscribe();
  return seen as T;
}
