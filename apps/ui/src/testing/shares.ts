import type { File as NodeFile } from "node:buffer";

import type { Holding, Posted } from "$lib/sharing/held";

/** The four calls a share needs from Cache Storage, over a map. */
export function holding(): Holding & { readonly size: () => number } {
  const held = new Map<string, Response>();
  const keyOf = (request: RequestInfo | URL) =>
    new URL(
      request instanceof Request ? request.url : String(request),
      "https://notes.example",
    ).href;

  return {
    size: () => held.size,
    put: (request, response) => {
      held.set(keyOf(request), response);
      return Promise.resolve();
    },
    keys: () =>
      Promise.resolve(
        [...held.keys()].map((url) => new Request(url)),
      ) as ReturnType<Cache["keys"]>,
    match: (request) => Promise.resolve(held.get(keyOf(request))?.clone()),
    delete: (request) => Promise.resolve(held.delete(keyOf(request))),
  };
}

/**
 * A post as the worker reads one. Node's own `File`, because jsdom's is not a
 * body a `Response` can carry, which a browser's is.
 */
export function posted(
  fields: Record<string, string>,
  files: NodeFile[] = [],
): Posted {
  return {
    get: (name) => fields[name] ?? null,
    getAll: (name) => (name === "files" ? (files as unknown as File[]) : []),
  };
}
