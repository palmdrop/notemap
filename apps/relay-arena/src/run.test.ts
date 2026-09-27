import { capturedLog } from "@notemap/log/testing";
import { PoolRefused, PoolUnreachable } from "@notemap/relay";
import type { Landed, Relay, Relayed } from "@notemap/relay";
import { describe, expect, it } from "vitest";

import { ArenaRateLimited, ArenaRefused, type Arena } from "./arena/read";
import type { ArenaBlock } from "./arena/types";
import { relayEverything, type ChannelTarget } from "./run";

function block(id: number, overrides: Partial<ArenaBlock> = {}): ArenaBlock {
  return {
    id,
    type: "Text",
    content: { markdown: `block ${String(id)}` },
    connection: { connected_at: "2026-09-04T14:23:05Z" },
    ...overrides,
  };
}

/** A channel as the fake answers it: one page, several, or the error it refuses with. */
type Upstream =
  | readonly ArenaBlock[]
  | { readonly pages: readonly (readonly ArenaBlock[])[] }
  | Error;

/** A fake are.na, keeping which handles it was asked for. */
function upstream(
  byHandle: Record<string, Upstream>,
): Arena & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async *pages(handle: string) {
      asked.push(handle);
      const entry = byHandle[handle];
      if (entry instanceof Error) throw entry;
      if (entry === undefined) return;
      if ("pages" in entry) yield* entry.pages;
      else yield entry;
    },
    open: () => Promise.resolve(new TextEncoder().encode("BYTES")),
  } as unknown as Arena & { asked: string[] };
}

function landing(answers: Record<string, Landed["kind"] | Error>): Relay {
  return {
    assetIdFor: () => "an-asset",
    relay: (one: Relayed) => {
      const answer = answers[one.sourceItemId] ?? "captured";
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve({ kind: answer, item: `item-${one.sourceItemId}` });
    },
  };
}

function channel(source: string, handle: string, relay: Relay): ChannelTarget {
  return { handle, source, tags: [], relay };
}

/** The warnings, which is where a block or a channel that failed is said. */
function warnings(said: string[]): string[] {
  return said.filter((line) => line.startsWith("WARN"));
}

const shallow = { full: false };

describe("one scan of every watched channel", () => {
  it("counts what each block came to", async () => {
    const reports = await relayEverything(
      upstream({ c: [block(1), block(2), block(3), block(4)] }),
      [
        channel(
          "arena/x",
          "c",
          landing({
            "1": "captured",
            "2": "already-captured",
            "3": "amended",
            "4": "revised",
          }),
        ),
      ],
      capturedLog().log,
      shallow,
    );

    expect(reports).toEqual([
      {
        source: "arena/x",
        readFailed: false,
        tally: {
          read: 4,
          captured: 1,
          unchanged: 1,
          amended: 1,
          revised: 1,
          empty: 0,
          failed: 0,
        },
      },
    ]);
  });

  it("carries on past a block it could not relay, and says which", async () => {
    const log = capturedLog();

    const reports = await relayEverything(
      upstream({ c: [block(1), block(2), block(3)] }),
      [
        channel(
          "arena/x",
          "c",
          landing({ "2": new Error("the pool refused it") }),
        ),
      ],
      log.log,
      shallow,
    );

    expect(reports[0]?.tally).toMatchObject({
      read: 3,
      captured: 2,
      failed: 1,
    });
    expect(warnings(log.lines())).toEqual([
      'WARN could not relay a block block=2 source=arena/x because="the pool refused it"',
    ]);
  });

  it("counts a channel-class block and an empty block as empty, and captures neither", async () => {
    const reports = await relayEverything(
      upstream({
        c: [
          block(1, { type: "Channel" }),
          block(2, { content: { markdown: "   " } }),
        ],
      }),
      [channel("arena/x", "c", landing({}))],
      capturedLog().log,
      shallow,
    );

    expect(reports[0]?.tally).toMatchObject({ read: 2, empty: 2, captured: 0 });
  });

  it("stops at once where it was the pool that failed, not the block", async () => {
    const log = capturedLog();
    const gone = new PoolUnreachable("/v1/captures", new Error("refused"));

    await expect(
      relayEverything(
        upstream({ c: [block(1), block(2)] }),
        [channel("arena/x", "c", landing({ "1": gone }))],
        log.log,
        shallow,
      ),
    ).rejects.toBe(gone);

    // Nothing said per block: the one thing wrong is said by whoever catches it.
    expect(warnings(log.lines())).toEqual([]);
  });

  it("stops on a token the pool will refuse for every block alike", async () => {
    const shut = new PoolRefused(401, "unauthorized", "/v1/captures");

    await expect(
      relayEverything(
        upstream({ c: [block(1)] }),
        [channel("arena/x", "c", landing({ "1": shut }))],
        capturedLog().log,
        shallow,
      ),
    ).rejects.toBe(shut);
  });

  it("ends a channel are.na refused, and lets the next channel run", async () => {
    const log = capturedLog();

    const reports = await relayEverything(
      upstream({
        gone: new ArenaRefused(
          404,
          "/v3/channels/gone/contents",
          "no such channel",
        ),
        fine: [block(1)],
      }),
      [
        channel("arena/gone", "gone", landing({})),
        channel("arena/fine", "fine", landing({})),
      ],
      log.log,
      shallow,
    );

    expect(reports).toEqual([
      {
        source: "arena/gone",
        readFailed: true,
        tally: {
          read: 0,
          captured: 0,
          unchanged: 0,
          amended: 0,
          revised: 0,
          empty: 0,
          failed: 0,
        },
      },
      {
        source: "arena/fine",
        readFailed: false,
        tally: {
          read: 1,
          captured: 1,
          unchanged: 0,
          amended: 0,
          revised: 0,
          empty: 0,
          failed: 0,
        },
      },
    ]);
    expect(warnings(log.lines())).toEqual([
      'WARN could not read a channel source=arena/gone because="/v3/channels/gone/contents was refused 404: no such channel"',
    ]);
  });
  it("stops after the first page holding a block the pool already had", async () => {
    const from = upstream({
      c: { pages: [[block(1)], [block(2), block(3)], [block(4)]] },
    });

    const reports = await relayEverything(
      from,
      [channel("arena/x", "c", landing({ "2": "already-captured" }))],
      capturedLog().log,
      shallow,
    );

    expect(reports[0]?.tally).toMatchObject({
      read: 3,
      captured: 2,
      unchanged: 1,
    });
  });

  it("reads every page on a full scan", async () => {
    const reports = await relayEverything(
      upstream({ c: { pages: [[block(1)], [block(2)], [block(3)]] } }),
      [
        channel(
          "arena/x",
          "c",
          landing({ "1": "already-captured", "2": "already-captured" }),
        ),
      ],
      capturedLog().log,
      { full: true },
    );

    expect(reports[0]?.tally).toMatchObject({ read: 3, captured: 1 });
  });

  it("reads on past a page of blocks the pool never takes, or could not take", async () => {
    const reports = await relayEverything(
      upstream({
        c: {
          pages: [[block(1, { type: "Channel" }), block(2)], [block(3)]],
        },
      }),
      [channel("arena/x", "c", landing({ "2": new Error("refused") }))],
      capturedLog().log,
      shallow,
    );

    expect(reports[0]?.tally).toMatchObject({
      read: 3,
      empty: 1,
      failed: 1,
      captured: 1,
    });
  });

  it("ends the whole poll when are.na rate-limits the token, and reads no further channel", async () => {
    const log = capturedLog();
    const limited = new ArenaRateLimited(
      "/v3/channels/a/contents",
      "slow down",
      undefined,
    );
    const from = upstream({ a: limited, b: [block(1)] });

    await expect(
      relayEverything(
        from,
        [
          channel("arena/a", "a", landing({})),
          channel("arena/b", "b", landing({})),
        ],
        log.log,
        shallow,
      ),
    ).rejects.toBe(limited);

    expect(from.asked).toEqual(["a"]);
    expect(warnings(log.lines())).toEqual([]);
  });
});
