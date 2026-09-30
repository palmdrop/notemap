import type { Item } from "#api/types";
import { COUNTS, HEALTH } from "./transport";

export function anItem(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    source: "test",
    sourceItemId: id,
    payload: { type: "note", content: { text: id }, metadata: {}, assets: [] },
    tags: [],
    createdAt: "2026-08-17T10:00:00.000Z",
    modifiedAt: "2026-08-17T10:00:00.000Z",
    revisedInto: [],
    ...overrides,
  };
}

export function routeOf(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

/** What was asked of the pool, less what the client asks on its own: health and counts. */
export function asked(transport: {
  readonly sent: readonly Request[];
}): readonly Request[] {
  return transport.sent.filter(
    (request) => routeOf(request) !== HEALTH && routeOf(request) !== COUNTS,
  );
}

export function stoppedClock(start = "2026-08-17T12:00:00.000Z") {
  let at = start;
  return {
    now: () => at,
    set(next: string) {
      at = next;
    },
  };
}
