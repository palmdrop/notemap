import { PoolRefused, PoolUnreachable } from "@notemap/relay";
import type { Landed, Relay, Relayed } from "@notemap/relay";
import { describe, expect, it } from "vitest";

import type { Memos } from "./memos/read";
import type { Memo } from "./memos/types";
import { relayEverything, type Log } from "./run";

function memo(uid: string, overrides: Partial<Memo> = {}): Memo {
  return {
    name: `memos/${uid}`,
    content: uid,
    createTime: "2026-09-04T14:23:05Z",
    updateTime: "2026-09-04T14:23:05Z",
    ...overrides,
  };
}

function upstream(memos: readonly Memo[]): Memos {
  return {
    whoami: () => Promise.resolve("users/1"),
    async *mine() {
      yield* memos;
    },
    open: () => Promise.resolve(new TextEncoder().encode("BYTES")),
  };
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

function logging(): Log & { faults: string[] } {
  const faults: string[] = [];
  return {
    faults,
    note: () => {},
    fault: (line, cause) => faults.push(`${line}: ${String(cause)}`),
  };
}

describe("one scan of everything upstream", () => {
  it("counts what each memo came to", async () => {
    const tally = await relayEverything(
      upstream([memo("a"), memo("b"), memo("c"), memo("d")]),
      landing({
        a: "captured",
        b: "already-captured",
        c: "amended",
        d: "revised",
      }),
      logging(),
    );

    expect(tally).toEqual({
      read: 4,
      captured: 1,
      unchanged: 1,
      amended: 1,
      revised: 1,
      empty: 0,
      failed: 0,
    });
  });

  it("carries on past a memo it could not relay, and says which", async () => {
    const log = logging();

    const tally = await relayEverything(
      upstream([memo("a"), memo("b"), memo("c")]),
      landing({ b: new Error("the pool refused it") }),
      log,
    );

    expect(tally).toMatchObject({ read: 3, captured: 2, failed: 1 });
    expect(log.faults).toEqual([
      "memos/b could not be relayed: Error: the pool refused it",
    ]);
  });

  it("stops at once where it was the pool that failed, not the memo", async () => {
    const log = logging();
    const gone = new PoolUnreachable("/v1/captures", new Error("refused"));

    await expect(
      relayEverything(
        upstream([memo("a"), memo("b"), memo("c")]),
        landing({ a: gone }),
        log,
      ),
    ).rejects.toBe(gone);

    // Nothing said per memo: the one thing wrong is said by whoever catches it.
    expect(log.faults).toEqual([]);
  });

  it("stops on a token the pool will refuse for every memo alike", async () => {
    const shut = new PoolRefused(401, "unauthorized", "/v1/captures");

    await expect(
      relayEverything(
        upstream([memo("a"), memo("b")]),
        landing({ a: shut }),
        logging(),
      ),
    ).rejects.toBe(shut);
  });

  it("captures nothing for a memo with nothing in it", async () => {
    const tally = await relayEverything(
      upstream([memo("a", { content: "" }), memo("b")]),
      landing({}),
      logging(),
    );

    expect(tally).toMatchObject({ read: 2, captured: 1, empty: 1, failed: 0 });
  });
});
