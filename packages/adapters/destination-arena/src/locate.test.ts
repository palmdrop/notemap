import type {
  CapabilityName,
  DestinationKindAdapter,
  LocateRequest,
} from "@notemap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { arenaRenderers } from "./blocks";
import { createArenaDestination } from "./destination";
import {
  bytes,
  deliveredAsset,
  delivery,
  destinationRow,
  resolverFor,
  startArenaServer,
  type ArenaServer,
} from "./testing";

let server: ArenaServer;

beforeEach(async () => {
  server = await startArenaServer();
});

afterEach(async () => {
  await server.close();
});

function adapter(): DestinationKindAdapter {
  return createArenaDestination({
    renderers: arenaRenderers(),
    credentials: resolverFor(server),
    uploadsUrl: server.uploadsUrl,
  });
}

async function deliveredTo(channel: string, files: number) {
  const outcome = await adapter().deliver(
    destinationRow(),
    delivery({
      arguments: { channel },
      assets: Array.from({ length: files }, (_, index) =>
        deliveredAsset(
          String(index).padStart(3, "0"),
          `${index}.png`,
          bytes(String(index)),
        ),
      ),
    }),
  );
  if (outcome.kind !== "delivered") throw new Error("expected a delivery");
  return outcome;
}

/** Takes the fields a delivered outcome may leave undefined, as a record leaves them absent. */
function locate(request: {
  readonly arguments: LocateRequest["arguments"];
  readonly pointer?: string | undefined;
  readonly pointers?: readonly string[] | undefined;
}) {
  const kind = adapter();
  if (kind.locate === undefined) throw new Error("the kind looks for nothing");
  return kind.locate(destinationRow(), {
    capability: "create" as CapabilityName,
    arguments: request.arguments,
    ...(request.pointer === undefined ? {} : { pointer: request.pointer }),
    ...(request.pointers === undefined ? {} : { pointers: request.pointers }),
  });
}

describe("keeping every block a delivery made", () => {
  it("names each of them beside the channel", async () => {
    const outcome = await deliveredTo("reading", 2);

    expect(outcome).toMatchObject({
      pointer: "reading",
      pointers: ["1001", "1002"],
    });
  });

  it("names none beside a single block, which the pointer already is", async () => {
    const outcome = await deliveredTo("reading", 1);

    expect(outcome.pointer).toBe("1001");
    expect(outcome).not.toHaveProperty("pointers");
  });
});

describe("looking for what a record points at", () => {
  it("counts the blocks still in the channel", async () => {
    const { pointer, pointers } = await deliveredTo("reading", 3);
    server.disconnect(1002);

    expect(
      await locate({ arguments: { channel: "reading" }, pointer, pointers }),
    ).toEqual({ kind: "present", found: 2, of: 3 });
  });

  it("finds a single block by its pointer", async () => {
    const { pointer } = await deliveredTo("reading", 1);

    expect(
      await locate({ arguments: { channel: "reading" }, pointer }),
    ).toEqual({ kind: "present", found: 1, of: 1 });
  });

  /** A block taken out of a channel goes on existing on are.na. */
  it("answers absent for a block taken out of the channel", async () => {
    const { pointer } = await deliveredTo("reading", 1);
    server.disconnect(1001);

    expect(
      await locate({ arguments: { channel: "reading" }, pointer }),
    ).toEqual({ kind: "absent" });
  });

  it("answers absent for a block that was deleted", async () => {
    const { pointer } = await deliveredTo("reading", 1);
    server.remove(1001);

    expect(
      await locate({ arguments: { channel: "reading" }, pointer }),
    ).toEqual({ kind: "absent" });
  });

  it("cannot tell for an older record of several blocks, which names only the channel", async () => {
    expect(
      await locate({ arguments: { channel: "reading" }, pointer: "reading" }),
    ).toEqual({ kind: "unknown" });
    expect(server.requests()).toEqual([]);
  });

  it("cannot tell for a pointer that names no block", async () => {
    expect(
      await locate({ arguments: { channel: "reading" }, pointer: "" }),
    ).toEqual({ kind: "unknown" });
    expect(server.requests()).toEqual([]);
  });
});
