export type Subscriber<T> = (value: T) => void;
export type Unsubscribe = () => void;

/**
 * The whole seam between the client's state and a shell. `subscribe` calls back
 * at once with the current value, which is what lets Svelte read one with `$`
 * and any other framework adapt it in a few lines.
 */
export interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscribe;
}

export interface Writable<T> extends Readable<T> {
  get(): T;
  set(value: T): void;
  update(change: (value: T) => T): void;
}

export function writable<T>(initial: T): Writable<T> {
  let current = initial;
  const subscribers = new Set<Subscriber<T>>();

  function set(value: T): void {
    current = value;
    for (const run of [...subscribers]) run(current);
  }

  return {
    get: () => current,
    set,
    update: (change) => set(change(current)),
    subscribe(run) {
      subscribers.add(run);
      run(current);
      return () => {
        subscribers.delete(run);
      };
    },
  };
}

export function derived<T, U>(
  source: Readable<T>,
  project: (value: T) => U,
): Readable<U> {
  return {
    subscribe: (run) => source.subscribe((value) => run(project(value))),
  };
}
