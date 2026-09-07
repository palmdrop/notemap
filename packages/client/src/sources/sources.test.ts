import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { SourceUse } from "#api/types";
import { createClient } from "../client";
import { Unreachable } from "../errors";
import { json, mockTransport, type Handler } from "#testing/transport";

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  return { client, transport };
}

const use = (id: string, items: number, at: string): SourceUse => ({
  id,
  items,
  lastCapturedAt: at,
});

describe("the sources in use", () => {
  it("answers what the pool said, in the order the pool said it", async () => {
    const memos = use("memos", 12, "2026-09-07T09:00:00.000Z");
    const web = use("web-manual", 3, "2026-09-06T09:00:00.000Z");
    const { client } = clientOver(() => json(200, { values: [memos, web] }));

    await expect(client.sources.inUse()).resolves.toEqual([memos, web]);
  });

  /** Nothing holds it: a remembered answer cannot say whether a source has stopped. */
  it("fails rather than answering an older list when the pool is out of reach", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [use("memos", 1, "2026-09-07T09:00:00.000Z")] }),
    );
    await client.sources.inUse();

    transport.unreachable(true);

    await expect(client.sources.inUse()).rejects.toBeInstanceOf(Unreachable);
  });
});
