import type { Item } from "../api/types";
import { HEALTH } from "./transport";

export function anItem(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    source: "test",
    sourceItemId: id,
    payload: { type: "text", content: { text: id }, metadata: {}, assets: [] },
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

/**
 * What was asked of the pool, less the client's own start-up health probe: a
 * test about what a caller reached for is not about the client's housekeeping.
 */
export function asked(transport: {
  readonly sent: readonly Request[];
}): readonly Request[] {
  return transport.sent.filter((request) => routeOf(request) !== HEALTH);
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
