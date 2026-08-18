import type { DestinationId, RoutingRecordId } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import type { SqlitePoolStore } from "./pool-store";
import {
  appendCapture,
  at,
  capture,
  destination,
  markedProcessed,
  putDestinations,
  reserved,
  store,
  VAULT,
} from "./testing/fixture";

const opened: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of opened.splice(0)) await cleanup();
});

function pool(): { pool: SqlitePoolStore } {
  const created = store();
  opened.push(created.cleanup);
  return created;
}

describe("the destinations a pool holds", () => {
  it("reads back what was written, oldest first", async () => {
    const { pool: p } = pool();
    await putDestinations(
      p,
      destination({
        id: "board",
        name: "Board",
        createdAt: "2026-08-04T08:00:00.000Z",
      }),
      destination(),
    );

    expect((await p.destinations()).map((each) => each.id)).toEqual([
      "vault",
      "board",
    ]);
    expect(await p.destination(VAULT)).toEqual({
      ...destination(),
      modifiedAt: expect.any(String),
    });
  });

  it("answers nothing for an id no destination has", async () => {
    const { pool: p } = pool();

    expect(await p.destination("ghost" as DestinationId)).toBeUndefined();
  });

  it("keeps the settings the kind wrote, untouched", async () => {
    const { pool: p } = pool();
    await putDestinations(
      p,
      destination({ settings: { root: "~/notes", accepts: "text" } }),
    );

    expect((await p.destination(VAULT))?.settings).toEqual({
      root: "~/notes",
      accepts: "text",
    });
  });

  it("carries an edit over every field a person may change", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    const before = await p.destination(VAULT);

    const after = await p.transaction((tx) =>
      tx.updateDestination({
        ...destination(),
        name: "The vault",
        settings: { root: "~/second-brain" },
        retiredAt: at("2026-08-17T12:00:00.000Z"),
      }),
    );

    expect(after).toMatchObject({
      id: "vault",
      name: "The vault",
      settings: { root: "~/second-brain" },
      retiredAt: "2026-08-17T12:00:00.000Z",
    });
    // A delta read has to be able to carry the change.
    expect(Date.parse(after.modifiedAt)).toBeGreaterThan(
      Date.parse(before?.modifiedAt ?? ""),
    );
  });

  it("drops retirement when it is written without one", async () => {
    const { pool: p } = pool();
    await putDestinations(
      p,
      destination({ retiredAt: "2026-08-17T12:00:00.000Z" }),
    );

    const offered = await p.transaction((tx) =>
      tx.updateDestination(destination()),
    );

    expect(offered.retiredAt).toBeUndefined();
  });
});

describe("whether a routing record has ever named a destination", () => {
  it("is false where none has, and the row may then be deleted", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());

    expect(await p.destinationEverNamed(VAULT)).toBe(false);
    await p.transaction((tx) => tx.deleteDestination(VAULT));
    expect(await p.destination(VAULT)).toBeUndefined();
  });

  /** A reservation counts: it is a decision that has not landed, not an absence of one. */
  it("is true for a delivery that has not landed yet", async () => {
    const { pool: p } = pool();
    const item = capture({ id: "item-1" });
    await putDestinations(p, destination());
    await appendCapture(p, item);
    await p.transaction((tx) => tx.insertRoutingRecord(reserved(item)));

    expect(await p.destinationEverNamed(VAULT)).toBe(true);
  });

  it("ignores a record that named nobody", async () => {
    const { pool: p } = pool();
    const item = capture({ id: "item-1" });
    await putDestinations(p, destination());
    await appendCapture(p, item);
    await p.transaction((tx) => tx.insertRoutingRecord(markedProcessed(item)));

    expect(await p.destinationEverNamed(VAULT)).toBe(false);
  });

  /**
   * The database refuses it too, so the rule holds even where a caller went
   * around the read above.
   */
  it("is refused by the database and not only by the read", async () => {
    const { pool: p } = pool();
    const item = capture({ id: "item-1" });
    await putDestinations(p, destination());
    await appendCapture(p, item);
    await p.transaction((tx) => tx.insertRoutingRecord(reserved(item)));

    await expect(
      p.transaction((tx) => tx.deleteDestination(VAULT)),
    ).rejects.toThrow(/FOREIGN KEY/i);
    expect(await p.destination(VAULT)).toBeDefined();
  });

  /**
   * A cancelled reservation is removed rather than marked, since nothing
   * happened to record — so the destination it named was never used, and may
   * still be deleted.
   */
  it("is false again once a cancelled reservation is removed", async () => {
    const { pool: p } = pool();
    const item = capture({ id: "item-1" });
    await putDestinations(p, destination());
    await appendCapture(p, item);
    const reservation = reserved(item);
    await p.transaction((tx) => tx.insertRoutingRecord(reservation));

    await p.transaction((tx) =>
      tx.removeRoutingRecord(reservation.id as RoutingRecordId),
    );

    expect(await p.destinationEverNamed(VAULT)).toBe(false);
  });
});
