import {
  BehaviorSubject,
  distinctUntilChanged,
  map,
  type Observable,
} from "rxjs";

/**
 * The seam between the client's state and a shell. `subscribe` calls back at
 * once with the current value, which is what lets Svelte read one with `$` and
 * any other framework adapt it in a few lines.
 *
 * The subject stays inside `writable`. `error` and `complete` belong to it and
 * not to the `Observable` handed out, so nothing downstream can end a surface
 * the whole interface is drawn from.
 */
export interface Writable<T> {
  get(): T;
  set(value: T): void;
  update(change: (value: T) => T): void;
  readonly changes: Observable<T>;
}

export function writable<T>(initial: T): Writable<T> {
  const subject = new BehaviorSubject(initial);

  return {
    get: () => subject.getValue(),
    set: (value) => subject.next(value),
    update: (change) => subject.next(change(subject.getValue())),
    changes: subject.asObservable(),
  };
}

export function derived<T, U>(
  source: Observable<T>,
  project: (value: T) => U,
  same?: (one: U, other: U) => boolean,
): Observable<U> {
  return source.pipe(map(project), distinctUntilChanged(same));
}
