import { describe, expect, it } from "vitest";

import { createApi } from "#api/http";
import { Unencodable } from "../errors";
import { emptyState } from "#state/state";
import { mockTransport } from "#testing/transport";
import type { Operation } from "./operations";
import { applyOperation, opposes, sendOperation, targetOf } from "./registry";

const AT = "2026-08-17T12:00:00.000Z";

const WITHOUT_A_ROUTE: readonly Operation[] = [
  { kind: "accept-suggestion", item: "one", suggestion: "s-1" },
  { kind: "reject-suggestion", item: "one", suggestion: "s-1" },
];

describe("the vocabulary beyond what /v1 answers", () => {
  const sending = {
    api: createApi(mockTransport(() => new Response(null, { status: 500 }))),
    bytes: () => Promise.resolve(undefined),
  };

  it.each(
    WITHOUT_A_ROUTE.map((operation) => [operation.kind, operation] as const),
  )(
    "refuses to send %s rather than guessing a wire",
    async (_kind, operation) => {
      await expect(sendOperation(sending, operation)).rejects.toBeInstanceOf(
        Unencodable,
      );
    },
  );

  it.each(
    WITHOUT_A_ROUTE.map((operation) => [operation.kind, operation] as const),
  )("refuses to apply %s optimistically either", (_kind, operation) => {
    expect(() => applyOperation(emptyState(), operation, AT)).toThrow(
      Unencodable,
    );
  });
});

describe("what an operation is about", () => {
  it("names the item a capture is going to create", () => {
    const envelope = {
      id: "minted",
      source: "web",
      sourceItemId: "minted",
      capturedAt: AT,
      payload: { type: "text", content: {}, metadata: {}, assets: [] },
    };

    expect(targetOf({ kind: "capture", envelope })).toBe("minted");
  });
});

describe("which operations oppose each other", () => {
  it("pairs archive with unarchive on one item, and nothing else", () => {
    expect(
      opposes(
        { kind: "archive", item: "one" },
        { kind: "unarchive", item: "one" },
      ),
    ).toBe(true);
    expect(
      opposes(
        { kind: "archive", item: "one" },
        { kind: "unarchive", item: "two" },
      ),
    ).toBe(false);
  });

  it("pairs a tag with its own untag, and not with another tag's", () => {
    expect(
      opposes(
        { kind: "tag", item: "one", tag: "a" },
        { kind: "untag", item: "one", tag: "a" },
      ),
    ).toBe(true);
    expect(
      opposes(
        { kind: "tag", item: "one", tag: "a" },
        { kind: "untag", item: "one", tag: "b" },
      ),
    ).toBe(false);
  });

  it("leaves commutative classification alone", () => {
    expect(
      opposes(
        { kind: "tag", item: "one", tag: "a" },
        { kind: "tag", item: "one", tag: "b" },
      ),
    ).toBe(false);
  });
});

describe("a tag sent with values for what its template asks", () => {
  async function bodySent(operation: Operation): Promise<unknown> {
    const bodies: unknown[] = [];
    const api = createApi(
      mockTransport(async (request) => {
        bodies.push(await request.json());
        return new Response(
          JSON.stringify({
            id: "one",
            source: "web",
            sourceItemId: "one",
            payload: { type: "note", content: {}, metadata: {}, assets: [] },
            tags: [],
            createdAt: AT,
            modifiedAt: AT,
            revisedInto: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    await sendOperation(
      { api, bytes: () => Promise.resolve(undefined) },
      operation,
    );
    return bodies[0];
  }

  it("carries them beside the tag", async () => {
    expect(
      await bodySent({
        kind: "tag",
        item: "one",
        tag: "route/todo",
        arguments: { heading: "Next" },
      }),
    ).toEqual({ tag: "route/todo", arguments: { heading: "Next" } });
  });

  it("sends the tag alone where it was given none", async () => {
    expect(
      await bodySent({ kind: "tag", item: "one", tag: "route/todo" }),
    ).toEqual({ tag: "route/todo" });
  });
});
