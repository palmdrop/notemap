import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { Item } from "../api/types";
import { createClient } from "../client";
import type { PendingOperation } from "../outbox/operations";
import { read, until } from "../testing/observing";
import { anItem } from "../testing/pool";
import { json, mockTransport } from "../testing/transport";
import { HISTORY } from "./retention";

/** Feed history: processed, so it is nobody's working set. */
function history(id: string, at: string): Item {
  return anItem(id, {
    modifiedAt: at,
    archived: { archivedAt: at },
  });
}

function anHourIn(hours: number): string {
  return `2020-01-01T${String(hours).padStart(2, "0")}:00:00.000Z`;
}

describe("retention", () => {
  it("caps feed history, oldest touched first, and spares the working set", async () => {
    const store = createMemoryStore();
    const old = [...Array(HISTORY + 10).keys()].map((at) =>
      history(`old-${String(at)}`, anHourIn(at % 24)),
    );
    await store.writeItems([
      ...old,
      anItem("work"),
      history("pending-on", "2020-06-01T00:00:00.000Z"),
    ]);
    await store.writeOperation({
      id: "op-1",
      operation: { kind: "unarchive", item: "pending-on" },
      at: "2026-08-17T11:00:00.000Z",
      state: "refused",
    } satisfies PendingOperation);

    const transport = mockTransport(() => json(200, { values: [] }));
    transport.unreachable(true);
    const client = createClient({ transport, store });
    await until(() => read(client.feed).items.length > 0);

    const kept = read(client.feed).items.map((item) => item.id);

    // Unprocessed, so it is the working set however much history there is.
    expect(kept).toContain("work");
    // An operation that has not drained is about it.
    expect(kept).toContain("pending-on");
    expect(kept.filter((id) => id.startsWith("old-"))).toHaveLength(HISTORY);
    // Evicted from the store as well: it mirrors the cache.
    expect(await store.readItems()).toHaveLength(HISTORY + 2);
  });

  it("keeps everything while there is less history than the cap", async () => {
    const store = createMemoryStore();
    await store.writeItems(
      [...Array(20).keys()].map((at) =>
        history(`old-${String(at)}`, anHourIn(at)),
      ),
    );

    const transport = mockTransport(() => json(200, { values: [] }));
    transport.unreachable(true);
    const client = createClient({ transport, store });
    await until(() => read(client.feed).items.length > 0);

    expect(read(client.feed).items).toHaveLength(20);
  });
});
