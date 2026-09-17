import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFilesystemStore } from "../adapters/filesystem-store";
import { createMemoryStore } from "../adapters/memory-store";
import type { Item } from "#api/types";
import { Refused, Unauthenticated, Unreachable } from "../errors";
import { writable, type Writable } from "../observable/observable";
import { cached, emptyState, withIds, type ClientState } from "#state/state";
import { until } from "#testing/observing";
import { anItem, stoppedClock } from "#testing/pool";
import { replacing, type Settlement } from "./handler";
import type { ClientStore } from "#ports/store";
import type { Operation } from "./operations";
import { createOutbox } from "./outbox";

const clock = stoppedClock();

/** Lets every queued microtask and the outbox's own awaits settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Outcome = { readonly item?: Item; readonly error?: unknown };

const answering = (outcome: Outcome): Settlement =>
  replacing(outcome.item as Item);

/**
 * The engine with the network held open, so a test decides when — and whether —
 * an operation is answered. The client's own drain is too fast to see between.
 */
function engineOver(
  items: readonly Item[],
  store: ClientStore = createMemoryStore(),
) {
  const sent: Operation[] = [];
  const reread: string[] = [];
  const waiting: ((outcome: Outcome) => void)[] = [];
  const released: Operation[] = [];

  const empty = emptyState();
  const state: Writable<ClientState> = writable({
    ...empty,
    items: cached(empty, items),
  });
  // The whole queue, so an item leaving and coming back is inside the window.
  state.update((current) => ({
    ...current,
    queue: {
      ...withIds(
        current.queue,
        items.map((item) => item.id),
      ),
      exhausted: true,
    },
  }));

  let minted = 0;

  const outbox = createOutbox({
    state,
    store,
    now: clock.now,
    mint: () => `op-${(minted += 1)}`,
    reread: (item) => {
      reread.push(item);
      return Promise.resolve();
    },
    released: (operation) => {
      released.push(operation);
      return Promise.resolve();
    },
    report: () => undefined,
    send: (operation) => {
      sent.push(operation);
      return new Promise<Settlement>((resolve, reject) => {
        waiting.push((outcome) =>
          outcome.error === undefined
            ? resolve(answering(outcome))
            : reject(outcome.error),
        );
      });
    },
  });

  function answer(outcome: Outcome): void {
    for (const settle of waiting.splice(0)) settle(outcome);
  }

  return { outbox, state, sent, reread, released, answer };
}

const ARCHIVE: Operation = { kind: "archive", item: "one" };
const UNARCHIVE: Operation = { kind: "unarchive", item: "one" };

const ENVELOPE = {
  id: "two",
  source: "web",
  sourceItemId: "two",
  capturedAt: "2026-08-17T12:00:00.000Z",
  payload: { type: "text", content: {}, metadata: {}, assets: [] },
};

const ARCHIVED: Item = {
  ...anItem("one"),
  archived: { archivedAt: "2026-08-17T12:00:00.000Z" },
};

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("opposing operations still in the outbox", () => {
  it("cancel each other out, and neither is sent", async () => {
    const { outbox, state, sent } = engineOver([anItem("one")]);

    clock.set("2026-08-17T12:00:01.000Z");
    await outbox.enqueue(ARCHIVE);
    expect(state.get().queue.ids).toEqual([]);

    clock.set("2026-08-17T12:00:02.000Z");
    await outbox.enqueue(UNARCHIVE);

    expect(state.get().queue.ids).toEqual(["one"]);
    expect(state.get().outbox).toEqual([]);

    await outbox.drain();
    expect(sent).toEqual([]);
  });

  it("refuse the one made earlier, however late it arrives", async () => {
    const { outbox, state } = engineOver([anItem("one")]);

    clock.set("2026-08-17T12:00:05.000Z");
    await outbox.enqueue(ARCHIVE);

    clock.set("2026-08-17T12:00:01.000Z");
    await outbox.enqueue(UNARCHIVE);

    expect(state.get().queue.ids).toEqual([]);
    expect(state.get().outbox).toHaveLength(1);
    expect(state.get().outbox[0]?.operation.kind).toBe("archive");
  });
});

describe("an operation already handed over", () => {
  it("does not cancel with a later one, even before it is recorded as sending", async () => {
    const { outbox, state, sent } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    // Claimed by the drain, but `send` has not yet written `sending`.
    void outbox.drain();
    expect(state.get().outbox[0]?.state).toBe("pending");

    clock.set("2026-08-17T12:00:02.000Z");
    await outbox.enqueue(UNARCHIVE);

    expect(sent).toEqual([ARCHIVE]);
    expect(state.get().outbox.map((held) => held.operation.kind)).toContain(
      "unarchive",
    );
  });

  it("does not cancel with a later one: the pool has it, so both go", async () => {
    const { outbox, sent, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const draining = outbox.drain();
    await flush();

    clock.set("2026-08-17T12:00:02.000Z");
    await outbox.enqueue(UNARCHIVE);

    answer({ item: ARCHIVED });
    await flush();
    answer({ item: anItem("one") });
    await draining;

    expect(sent).toEqual([ARCHIVE, UNARCHIVE]);
  });
});

describe("draining", () => {
  it("sends operations against one item in order, never overlapping", async () => {
    const { outbox, sent, answer } = engineOver([]);
    const capture: Operation = { kind: "capture", envelope: ENVELOPE };

    await outbox.enqueue(capture);
    clock.set("2026-08-17T12:00:02.000Z");
    await outbox.enqueue({ kind: "archive", item: "two" });

    const draining = outbox.drain();
    await flush();

    // The archive has not gone: it waits for the capture that creates its item.
    expect(sent).toEqual([capture]);

    answer({ item: anItem("two") });
    await flush();
    expect(sent).toHaveLength(2);

    answer({ item: { ...anItem("two"), archived: { archivedAt: "now" } } });
    await draining;

    expect(sent.map((operation) => operation.kind)).toEqual([
      "capture",
      "archive",
    ]);
  });

  it("does not send the same operation twice when drained twice", async () => {
    const { outbox, sent, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const first = outbox.drain();
    const second = outbox.drain();

    await flush();
    answer({ item: ARCHIVED });
    await Promise.all([first, second]);

    expect(sent).toEqual([ARCHIVE]);
  });

  it("rolls back a refusal, keeps it to be read, and does not retry it", async () => {
    const { outbox, state, sent, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const draining = outbox.drain();
    await flush();
    answer({ error: new Refused("no-such-item", "that item is not here") });
    await draining;

    expect(state.get().queue.ids).toEqual(["one"]);
    expect(state.get().outbox[0]?.state).toBe("refused");
    expect(state.get().outbox[0]?.failure).toBe("that item is not here");

    await outbox.drain();
    expect(sent).toEqual([ARCHIVE]);
  });

  /**
   * The correctness requirement behind all of this: a session that lapsed while
   * the shell was away must not burn what is queued. A refusal is terminal, and
   * a shut door is not a refusal — the pool never weighed the work at all.
   */
  it("parks on a shut door rather than refusing, and drains once it opens", async () => {
    const { outbox, state, sent, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const first = outbox.drain();
    await flush();
    answer({ error: new Unauthenticated() });
    await first;

    expect(state.get().outbox[0]?.state).toBe("unreachable");
    // The optimistic state stands: the item is still out of the queue.
    expect(state.get().queue.ids).toEqual([]);

    const second = outbox.drain();
    await flush();
    answer({ item: ARCHIVED });
    await second;

    expect(sent).toEqual([ARCHIVE, ARCHIVE]);
    expect(state.get().outbox).toEqual([]);
  });

  it("parks every entry behind it, not only the one that met the door", async () => {
    const { outbox, state, answer } = engineOver([
      anItem("one"),
      anItem("two"),
    ]);

    await outbox.enqueue(ARCHIVE);
    await outbox.enqueue({ kind: "archive", item: "two" });

    const draining = outbox.drain();
    await flush();
    answer({ error: new Unauthenticated() });
    await flush();
    answer({ error: new Unauthenticated() });
    await draining;

    expect(state.get().outbox.map((entry) => entry.state)).toEqual([
      "unreachable",
      "unreachable",
    ]);
  });

  it("keeps an unreachable operation applied, and sends it again next time", async () => {
    const { outbox, state, sent, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const first = outbox.drain();
    await flush();
    answer({ error: new Unreachable(new Error("down")) });
    await first;

    expect(state.get().queue.ids).toEqual([]);
    expect(state.get().outbox[0]?.state).toBe("unreachable");

    const second = outbox.drain();
    await flush();
    answer({ item: ARCHIVED });
    await second;

    expect(sent).toEqual([ARCHIVE, ARCHIVE]);
    expect(state.get().outbox).toEqual([]);
  });
});

describe("an operation leaving the outbox", () => {
  it("is released once the pool has taken it", async () => {
    const { outbox, released, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const draining = outbox.drain();
    await flush();
    answer({ item: ARCHIVED });
    await draining;

    expect(released).toEqual([ARCHIVE]);
  });

  it("is released when a refusal is dismissed, and not while it stands", async () => {
    const { outbox, state, released, answer } = engineOver([anItem("one")]);

    await outbox.enqueue(ARCHIVE);
    const draining = outbox.drain();
    await flush();
    answer({ error: new Refused("no-such-item", "that item is not here") });
    await draining;

    expect(released).toEqual([]);

    await outbox.dismiss(state.get().outbox[0]!.id);
    expect(released).toEqual([ARCHIVE]);
  });
});

/**
 * Two processes over one directory, each a store of its own over it. The
 * network is held open on both, so what each has sent is what it decided to.
 */
describe("two outboxes over one store", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "notemap-outbox-"));
  });

  afterEach(() => rm(directory, { recursive: true, force: true }));

  const another = () =>
    engineOver([anItem("one")], createFilesystemStore(directory));

  /** The first process, holding the lease on an archive it is sending. */
  async function sending() {
    const first = another();
    await first.outbox.enqueue(ARCHIVE);
    const draining = first.outbox.drain();
    await until(() => first.sent.length > 0);
    return { ...first, draining };
  }

  it("leaves alone what the other is sending, and says until when", async () => {
    const first = await sending();

    const second = another();
    expect(await second.outbox.drain()).toBe("2026-08-17T12:01:00.000Z");

    expect(first.sent).toEqual([ARCHIVE]);
    expect(second.sent).toEqual([]);
    expect(second.state.get().outbox.map((held) => held.state)).toEqual([
      "sending",
    ]);
  });

  it("takes over a lease the other abandoned, once it lapses", async () => {
    await sending();

    const second = another();
    await second.outbox.drain();
    expect(second.sent).toEqual([]);

    clock.set("2026-08-17T12:01:00.000Z");
    void second.outbox.drain();
    await until(() => second.sent.length > 0);

    expect(second.sent).toEqual([ARCHIVE]);
    expect(
      (await createFilesystemStore(directory).readOutbox())[0]?.until,
    ).toBe("2026-08-17T12:02:00.000Z");
  });

  it("does not send what the other landed while it waited", async () => {
    const first = await sending();

    const second = another();
    await second.outbox.drain();

    first.answer({ item: ARCHIVED });
    await first.draining;

    clock.set("2026-08-17T12:01:00.000Z");
    expect(await second.outbox.drain()).toBeUndefined();

    expect(second.sent).toEqual([]);
    expect(second.state.get().outbox).toEqual([]);
  });

  it("takes up what the other enqueued and never sent", async () => {
    const first = another();
    await first.outbox.enqueue(ARCHIVE);

    const second = another();
    void second.outbox.drain();
    await until(() => second.sent.length > 0);

    expect(second.sent).toEqual([ARCHIVE]);
  });

  it("sends an operation both reach at once exactly once", async () => {
    const first = another();
    await first.outbox.enqueue(ARCHIVE);
    const second = another();
    const third = another();

    void first.outbox.drain();
    void second.outbox.drain();
    void third.outbox.drain();
    const sent = () => [...first.sent, ...second.sent, ...third.sent];
    await until(() => sent().length > 0);
    await flush();
    await flush();

    expect(sent()).toEqual([ARCHIVE]);
  });
});
