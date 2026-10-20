import { describe, expect, it } from "vitest";

import { createRelay } from "./relay";
import type { Relayed } from "./types";

const ONE: Relayed = {
  sourceItemId: "u-1",
  version: "v2",
  capturedAt: "2026-09-04T14:23:05.000Z",
  text: "rewritten upstream",
  tags: ["route/research", "kind/quote"],
  attachments: [],
};

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A pool answering each capture in turn, keeping what it was sent. */
function pool(...answers: Response[]) {
  const sent: Record<string, unknown>[] = [];
  const relay = createRelay({
    pool: {
      url: "http://pool.test",
      token: "t",
      fetch: async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        const next = answers.shift();
        if (next === undefined) throw new Error("asked once too often");
        return next;
      },
    },
    source: "memos",
    namespace: "0198f0c2-0000-7000-8000-0000000000aa",
  });
  return { relay, sent };
}

const diverged = () =>
  answer(409, {
    error: { code: "source-item-diverged", existing: "head" },
  });

describe("a divergence", () => {
  it("is continued under an identity of its own, naming the head", async () => {
    const { relay, sent } = pool(
      diverged(),
      answer(201, { kind: "captured", item: { id: "continuation" } }),
    );

    expect(await relay.relay(ONE)).toEqual({
      kind: "continued",
      item: "continuation",
    });
    expect(sent[1]).toMatchObject({
      sourceItemId: "u-1@v2/continued",
      continues: "head",
      tags: ONE.tags,
    });
  });

  it("fails this item, and not the poll, where the continuation is refused", async () => {
    const { relay } = pool(
      diverged(),
      answer(409, {
        error: { code: "source-item-changed", existing: "other" },
      }),
    );

    await expect(relay.relay(ONE)).rejects.toThrow(
      "continuing head answered changed",
    );
  });
});
