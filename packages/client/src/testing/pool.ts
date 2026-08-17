import type { Item } from "../api/types";

export function anItem(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    source: "test",
    sourceItemId: id,
    payload: { type: "text", content: { text: id }, metadata: {}, assets: [] },
    tags: [],
    createdAt: "2026-08-17T10:00:00.000Z",
    modifiedAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

export function routeOf(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
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
