type Source<T> = {
  subscribe: (next: (value: T) => void) => { unsubscribe: () => void };
};

/** What an observable holds now. Structural, so the suite imports no rxjs. */
export function read<T>(source: Source<T>): T {
  let seen: { value: T } | undefined;
  source
    .subscribe((value) => {
      seen = { value };
    })
    .unsubscribe();

  if (seen === undefined) {
    throw new Error(
      "the source emitted nothing on subscribe, so it holds no value to read",
    );
  }
  return seen.value;
}
