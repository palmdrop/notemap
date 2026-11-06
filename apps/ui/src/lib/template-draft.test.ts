import type { Destination, Item, RoutingRecord } from "@notemap/client";
import { describe, expect, test } from "vitest";

import { draftOf, templatable } from "./template-draft";

const VAULT = { id: "vault", name: "Vault" } as Destination;

const ITEM = {
  id: "item-1",
  payload: { content: { text: "A bike rack\nthat folds" } },
} as unknown as Item;

function routed(
  args: Record<string, unknown>,
  more: Partial<RoutingRecord> = {},
  capability = "create-or-append",
): RoutingRecord {
  return {
    id: "record-1",
    item: "item-1",
    target: {
      kind: "destination",
      destination: "vault",
      capability,
      arguments: args,
    },
    state: "delivered",
    at: "2026-11-01T10:00:00.000Z",
    ...more,
  };
}

describe("which records are worth saving as a template", () => {
  test("one made by hand to a destination still held", () => {
    expect(templatable(routed({ path: "inbox/" }), [VAULT])).toBe(true);
  });

  test("not one a template made", () => {
    const record = routed(
      { path: "inbox/" },
      { applied: { template: "t", firedByTag: false } },
    );
    expect(templatable(record, [VAULT])).toBe(false);
  });

  test("not one marked by hand", () => {
    const record = { ...routed({}), target: { kind: "user" as const } };
    expect(templatable(record, [VAULT])).toBe(false);
  });

  test("not one withdrawn", () => {
    const record = routed(
      { path: "inbox/" },
      { withdrawnAt: "2026-11-01T11:00:00.000Z" },
    );
    expect(templatable(record, [VAULT])).toBe(false);
  });

  test("not one whose destination is gone", () => {
    expect(templatable(routed({ path: "inbox/" }), [])).toBe(false);
  });
});

describe("a record as a template", () => {
  test("keeps the destination, the capability and the arguments", () => {
    expect(
      draftOf(routed({ path: "inbox/", heading: "## Ideas" }), ITEM, [VAULT]),
    ).toEqual({
      destination: "vault",
      capability: "create-or-append",
      arguments: { path: "inbox/", heading: "## Ideas" },
      folder: "create",
      rewriteLeft: false,
    });
  });

  test("takes the folder mode out of the arguments", () => {
    const draft = draftOf(routed({ path: "inbox/", folder: "require" }), ITEM, [
      VAULT,
    ]);
    expect(draft?.folder).toBe("require");
    expect(draft?.arguments).toEqual({ path: "inbox/" });
  });

  test("leaves off the name this item was given", () => {
    expect(
      draftOf(routed({ path: "inbox/a-bike-rack.md" }), ITEM, [VAULT])
        ?.arguments,
    ).toEqual({ path: "inbox/" });
    expect(
      draftOf(routed({ path: "a-bike-rack.md" }), ITEM, [VAULT])?.arguments,
    ).toEqual({ path: "" });
  });

  test("and a free name beside it", () => {
    expect(
      draftOf(routed({ path: "inbox/a-bike-rack-2.md" }), ITEM, [VAULT])
        ?.arguments,
    ).toEqual({ path: "inbox/" });
  });

  test("keeps a name somebody typed", () => {
    for (const path of [
      "inbox/decisions.md",
      "inbox/a-bike-rack-x.md",
      "inbox/a-bike-rack-0.md",
    ]) {
      expect(draftOf(routed({ path }), ITEM, [VAULT])?.arguments).toEqual({
        path,
      });
    }
  });

  test("leaves off a derived filename where the capability creates", () => {
    expect(
      draftOf(
        routed(
          { directory: "inbox", filename: "a-bike-rack.md" },
          {},
          "create",
        ),
        ITEM,
        [VAULT],
      )?.arguments,
    ).toEqual({ directory: "inbox" });
  });

  test("keeps a named note where the capability appends", () => {
    expect(
      draftOf(routed({ path: "a-bike-rack.md" }, {}, "append"), ITEM, [VAULT])
        ?.arguments,
    ).toEqual({ path: "a-bike-rack.md" });
  });

  test("derives from the rewrite, and says it was left behind", () => {
    const record = routed({ path: "inbox/other-words.md" });
    const rewritten = {
      ...record,
      target: { ...record.target, content: { text: "Other words" } },
    } as RoutingRecord;

    expect(draftOf(rewritten, ITEM, [VAULT])).toMatchObject({
      arguments: { path: "inbox/" },
      rewriteLeft: true,
    });
  });

  test("is nothing for a record it does not offer on", () => {
    expect(draftOf(routed({ path: "inbox/" }), ITEM, [])).toBeUndefined();
  });
});
