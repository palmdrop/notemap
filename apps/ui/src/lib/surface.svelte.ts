import type { ListState } from "@notemap/client";

/**
 * What a surface says about itself rather than about a row.
 *
 * `read` is what separates a surface the pool has not answered for from one
 * nobody has asked about: hydration finishes before the first read sets
 * `loading`, so without it the cached mark is drawn on every load and taken
 * away again.
 */
export function surface() {
  let asked = $state(false);

  return {
    read<T>(reading: Promise<T>): Promise<T> {
      return reading.finally(() => (asked = true));
    },

    cached: (list: ListState) => asked && list.fromCache && !list.loading,

    refused: (list: ListState) =>
      list.failure?.refused === true ? list.failure.said : undefined,
  };
}
