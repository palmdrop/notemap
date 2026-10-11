import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createClient,
  createMemoryStore,
  type Client,
  type ClientStore,
} from "@notemap/client";
import {
  anItem,
  asked,
  json,
  mockTransport,
  routeOf,
  type Handler,
  type MockTransport,
} from "@notemap/client/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attached, capturing, chosen, excerpt } from "./note";

const UPLOAD = "PUT /v1/assets/";
const CAPTURE = "POST /v1/captures";

type Envelope = { payload: { assets: readonly { asset: string }[] } };

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "notemap-raycast-"));
});

afterEach(() => rm(directory, { recursive: true, force: true }));

describe("what a toast says was captured", () => {
  it("is the note itself where it is short enough to be", () => {
    expect(excerpt("a short note")).toBe("a short note");
  });

  it("is one line, since a toast has one", () => {
    expect(excerpt("two\nlines  and   spaces")).toBe("two lines and spaces");
  });

  it("stops at the limit rather than running past it", () => {
    const said = excerpt("a".repeat(80));

    expect(said).toHaveLength(60);
    expect(said.endsWith("…")).toBe(true);
  });
});

describe("the tags a capture carries", () => {
  it("are those picked and those typed, in that order", () => {
    expect(chosen(["reading"], "later, unsorted")).toEqual([
      "reading",
      "later",
      "unsorted",
    ]);
  });

  it("drop the whitespace and the gaps a comma leaves", () => {
    expect(chosen([], "  spaced  , , also  ")).toEqual(["spaced", "also"]);
  });

  it("name a tag once, however it was given", () => {
    expect(chosen(["reading"], "reading, later")).toEqual(["reading", "later"]);
  });

  it("are none at all where nothing was picked or typed", () => {
    expect(chosen([], "   ")).toEqual([]);
  });
});

describe("an attachment", () => {
  /** Holds what it was handed, which is all this needs of a client. */
  function attaches(): { client: Client; held: () => File | undefined } {
    let seen: File | undefined;
    const client = {
      attach: (file: File) => {
        seen = file;
        return Promise.resolve("asset-id");
      },
    } as unknown as Client;

    return { client, held: () => seen };
  }

  it("carries the file's own name and the type its suffix reads as", async () => {
    const path = join(directory, "a-screenshot.PNG");
    await writeFile(path, "bytes");
    const { client, held } = attaches();

    await attached(client, path);

    expect(held()?.name).toBe("a-screenshot.PNG");
    expect(held()?.type).toBe("image/png");
  });

  it("leaves the type to the client where the suffix says nothing", async () => {
    const path = join(directory, "notes.unheard-of");
    await writeFile(path, "bytes");
    const { client, held } = attaches();

    await attached(client, path);

    expect(held()?.type).toBe("");
  });
});

describe("a capture made from the form", () => {
  /** A store that says which assets it is holding bytes for, which the port cannot be asked. */
  function recording(store: ClientStore): {
    readonly store: ClientStore;
    readonly held: () => readonly string[];
  } {
    const held = new Set<string>();
    return {
      store: {
        ...store,
        async writeBlob(asset, blob) {
          await store.writeBlob(asset, blob);
          held.add(asset);
        },
        async removeBlob(asset) {
          await store.removeBlob(asset);
          held.delete(asset);
        },
      },
      held: () => [...held],
    };
  }

  /** Answers every route a capture carrying one file touches. */
  function taking(): Handler {
    return (request) => {
      const route = routeOf(request);
      if (route.startsWith(UPLOAD)) {
        return json(201, { id: route.slice(UPLOAD.length) });
      }
      if (route === CAPTURE) {
        return json(201, { kind: "captured", item: anItem("item-1") });
      }
      return json(200, { values: [] });
    };
  }

  function uploads(transport: MockTransport): readonly string[] {
    return asked(transport)
      .map(routeOf)
      .filter((route) => route.startsWith(UPLOAD));
  }

  async function envelopes(transport: MockTransport): Promise<Envelope[]> {
    return Promise.all(
      asked(transport)
        .filter((request) => routeOf(request) === CAPTURE)
        .map((request) => request.clone().json() as Promise<Envelope>),
    );
  }

  async function aFile(name: string): Promise<string> {
    const path = join(directory, name);
    await writeFile(path, "bytes");
    return path;
  }

  it("names every file it attached, in the order they were picked", async () => {
    const transport = mockTransport(taking());
    const client = createClient({ transport, store: createMemoryStore() });

    const captured = await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [await aFile("first.png"), await aFile("second.pdf")],
      tags: [],
    });
    expect(captured.kind).toBe("captured");

    await vi.waitFor(async () => {
      expect(await envelopes(transport)).toHaveLength(1);
    });
    await client.close();

    const [envelope] = await envelopes(transport);
    expect(envelope?.payload.assets).toHaveLength(2);
    expect(uploads(transport)).toHaveLength(2);
  });

  it("lets go of the files it held where a later one cannot be", async () => {
    let attaching = 0;
    const { client, detached } = stub({
      attach: () => {
        attaching += 1;
        if (attaching === 2) return Promise.reject(new Error("no room"));
        return Promise.resolve(`asset-${String(attaching)}`);
      },
    });

    const captured = await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [await aFile("first.png"), await aFile("second.pdf")],
      tags: [],
    });

    expect(captured.kind).toBe("refused");
    expect(detached).toEqual(["asset-1"]);
  });

  it("names the asset it attached, so the file goes with the words", async () => {
    const transport = mockTransport(taking());
    const client = createClient({ transport, store: createMemoryStore() });

    const captured = await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [await aFile("shot.png")],
      tags: [],
    });
    expect(captured.kind).toBe("captured");

    // The capture resolves as the outbox takes it; the pair goes in the drain.
    await vi.waitFor(async () => {
      expect(await envelopes(transport)).toHaveLength(1);
    });
    await client.close();

    const [envelope] = await envelopes(transport);
    expect(envelope?.payload.assets).toHaveLength(1);
    expect(uploads(transport)).toHaveLength(1);
  });

  it("applies the tags it was given, once the capture is made", async () => {
    const transport = mockTransport(taking());
    const client = createClient({ transport, store: createMemoryStore() });

    await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [],
      tags: ["reading", "later"],
    });

    await vi.waitFor(() => {
      expect(
        asked(transport)
          .map(routeOf)
          .filter((route) => route.endsWith("/tag")),
      ).toHaveLength(2);
    });
    await client.close();
  });

  /** A client that answers what each test needs of it, and records what it was asked. */
  function stub(answers: Partial<Client>): {
    readonly client: Client;
    readonly detached: readonly string[];
  } {
    const detached: string[] = [];
    const client = {
      attach: () => Promise.resolve("asset-1"),
      capture: () => Promise.resolve({ id: "item-1" }),
      tag: () => Promise.resolve(),
      detach: (asset: string) => {
        detached.push(asset);
        return Promise.resolve();
      },
      ...answers,
    } as unknown as Client;

    return { client, detached };
  }

  it("lets go of the bytes where the capture never reached the outbox", async () => {
    const { client, detached } = stub({
      capture: () => Promise.reject(new Error("the store would not write")),
    });

    const captured = await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [await aFile("shot.png")],
      tags: [],
    });

    expect(captured.kind).toBe("refused");
    expect(detached).toEqual(["asset-1"]);
  });

  it("says a capture was made in part where a tag could not be applied", async () => {
    const { client, detached } = stub({
      tag: () => Promise.reject(new Error("no such tag")),
    });

    const captured = await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [await aFile("shot.png")],
      tags: ["reading"],
    });

    expect(captured.kind).toBe("partly");
    // The capture names the bytes, so they are not this to let go of.
    expect(detached).toEqual([]);
  });

  it("keeps the bytes of a capture the pool refused, which still names them", async () => {
    const { store, held } = recording(createMemoryStore());
    const transport = mockTransport((request) =>
      routeOf(request) === CAPTURE
        ? json(422, { error: { code: "payload-invalid" } })
        : taking()(request),
    );
    const client = createClient({ transport, store });

    const captured = await capturing(client, {
      channel: "raycast",
      text: "a note",
      files: [await aFile("shot.png")],
      tags: [],
    });
    expect(captured.kind).toBe("captured");

    // The refused capture is the only copy of what it carried, so the bytes are
    // its until it is sent again or let go of.
    await vi.waitFor(async () => {
      const [waiting] = await store.readOutbox();
      expect(waiting?.state).toBe("refused");
    });
    expect(held()).toHaveLength(1);
    await client.close();
  });
});
