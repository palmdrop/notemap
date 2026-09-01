import {
  chmod,
  lstat,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { Unusable } from "@notemap/core";
import type {
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
  PayloadTypeName,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemDestination } from "./destination";
import { linkTo, type Renderer } from "@notemap/output-markdown";
import {
  bytes,
  delivery,
  deliveredAsset,
  destinationRow,
  filesUnder,
  root,
  TEXT,
} from "./testing/fixture";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const renderText: Renderer = (each) => ({
  body: `${String(each.payload.content["text"] ?? "")}\n`,
});

/** Links every asset it was handed, so the names they landed under are visible. */
const renderWithAssets: Renderer = (each, where) => ({
  body: [...where.assets.values()]
    .map((name) => `![](${linkTo(name)})`)
    .join("\n"),
});

/**
 * The kind, with one destination row already bound to it. The row is a
 * parameter of every call, so the tests hold it once here rather than at each.
 */
type Bound = {
  describe(): Promise<DestinationDescriptor>;
  deliver(delivery: Delivery, signal?: AbortSignal): Promise<DeliveryOutcome>;
};

type Vault = {
  readonly path: string;
  readonly destination: Bound;
};

function bind(
  path: string,
  accepts: readonly PayloadTypeName[],
  renderers: Record<string, Renderer>,
  reserved: readonly string[] = [],
): Bound {
  const kind = createFilesystemDestination({ renderers, accepts, reserved });
  const row = destinationRow({ root: path });

  return {
    describe: () => kind.describe(row),
    deliver: (each, signal) => kind.deliver(row, each, signal),
  };
}

async function vault(renderers: Record<string, Renderer> = {}): Promise<Vault> {
  const made = root();
  cleanups.push(made.cleanup);
  await mkdir(made.path, { recursive: true });

  return {
    path: made.path,
    destination: bind(made.path, [TEXT, "image" as PayloadTypeName], renderers),
  };
}

async function noVault(): Promise<Vault> {
  const made = root();
  cleanups.push(made.cleanup);

  return { path: made.path, destination: bind(made.path, [TEXT], {}) };
}

describe("what it says it can do", () => {
  it("declares both capabilities over the payload types it was given", async () => {
    const { destination } = await vault();
    const described = await destination.describe();

    expect(described.capabilities.map((each) => each.name)).toEqual([
      "create-file",
      "append-to-file",
    ]);
    expect(described.capabilities[0]?.accepts).toEqual([TEXT, "image"]);
    expect(described.capabilities[1]?.argumentsSchema).toMatchObject({
      required: ["path"],
    });
  });
});

describe("creating a file", () => {
  it("lands the note with its frontmatter and its body", async () => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      delivery({
        arguments: { directory: "inbox", filename: "a-thought.md" },
        tags: ["kind/quote"],
      }),
    );

    expect(outcome).toEqual({
      kind: "delivered",
      pointer: "inbox/a-thought.md",
    });

    const written = await readFile(join(path, "inbox", "a-thought.md"), "utf8");
    expect(written).toContain("id: 'item-1'");
    expect(written).toContain("captured_at: '2026-08-11T14:23:05.000Z'");
    expect(written).toContain("derived_from: 'urn:commons:item:item-1'");
    expect(written).toContain("- 'kind/quote'");
    expect(written.endsWith("a thought\n")).toBe(true);
  });

  it("derives a filename from the first line when the arguments name none", async () => {
    const { destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      delivery({
        arguments: { directory: "inbox" },
        content: { text: "Read: Borges — Ficciones\nand then the rest" },
      }),
    );

    expect(outcome).toMatchObject({
      pointer: "inbox/Read- Borges - Ficciones.md",
    });
  });

  it("falls back to the item id where there is no prose at all", async () => {
    const { destination } = await vault();

    expect(
      await destination.deliver(
        delivery({ arguments: { directory: "" }, content: { count: 4 } }),
      ),
    ).toMatchObject({ pointer: "item-1.md" });
  });

  it("writes into the root itself when the directory is empty", async () => {
    const { path, destination } = await vault({ text: renderText });

    await destination.deliver(
      delivery({ arguments: { directory: "", filename: "a.md" } }),
    );

    expect(await filesUnder(path)).toEqual(["a.md"]);
  });

  it("refuses rather than overwriting a file that is already there", async () => {
    const { path, destination } = await vault({ text: renderText });
    await mkdir(join(path, "inbox"), { recursive: true });
    await writeFile(join(path, "inbox", "a.md"), "theirs\n");

    const outcome = await destination.deliver(
      delivery({ arguments: { directory: "inbox", filename: "a.md" } }),
    );

    expect(outcome.kind).toBe("rejected");
    expect(await readFile(join(path, "inbox", "a.md"), "utf8")).toBe(
      "theirs\n",
    );
  });

  it("falls back to a fenced JSON block for a payload type with no renderer", async () => {
    const { path, destination } = await vault();

    await destination.deliver(
      delivery({
        type: "walk" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        content: { nodes: ["one"] },
      }),
    );

    expect(await readFile(join(path, "a.md"), "utf8")).toContain("```json");
  });
});

describe("nothing escapes the root", () => {
  const outside = [
    { directory: "..", filename: "escaped.md" },
    { directory: "inbox/../..", filename: "escaped.md" },
    { directory: "/tmp", filename: "escaped.md" },
    { directory: "", filename: "../escaped.md" },
  ];

  it.each(outside)("refuses %o and writes nothing", async (args) => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(delivery({ arguments: args }));

    expect(outcome.kind).toBe("rejected");
    expect(await filesUnder(path)).toEqual([]);
    expect(await filesUnder(join(path, ".."))).toEqual([]);
  });

  it("refuses arguments that leave through a symlink", async () => {
    const { path, destination } = await vault({ text: renderText });
    const elsewhere = join(path, "..", "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await symlink(elsewhere, join(path, "escape"));

    const outcome = await destination.deliver(
      delivery({ arguments: { directory: "escape", filename: "a.md" } }),
    );

    expect(outcome.kind).toBe("rejected");
    expect(await filesUnder(elsewhere)).toEqual([]);
  });

  it("refuses arguments naming the root itself", async () => {
    const { destination } = await vault({ text: renderText });

    expect(
      await destination.deliver(
        delivery({ capability: "append-to-file", arguments: { path: "." } }),
      ),
    ).toMatchObject({ kind: "rejected" });
  });
});

describe("appending to a file", () => {
  it("creates the file when it is missing, frontmatter and all", async () => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily/2026-08-11.md", heading: "Notes" },
      }),
    );

    expect(outcome).toMatchObject({ pointer: "daily/2026-08-11.md" });
    const written = await readFile(
      join(path, "daily", "2026-08-11.md"),
      "utf8",
    );
    expect(written).toContain("id: 'item-1'");
    expect(written).toContain("## Notes\n\na thought\n");
  });

  it("lands under an existing heading and leaves the rest alone", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(
      join(path, "daily.md"),
      [
        "# Monday",
        "",
        "## Notes",
        "",
        "an earlier line",
        "",
        "## Later",
        "",
        "after",
        "",
      ].join("\n"),
    );

    await destination.deliver(
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md", heading: "Notes" },
      }),
    );

    expect(await readFile(join(path, "daily.md"), "utf8")).toBe(
      [
        "# Monday",
        "",
        "## Notes",
        "",
        "an earlier line",
        "",
        "a thought",
        "",
        "## Later",
        "",
        "after",
        "",
      ].join("\n"),
    );
  });

  it("writes through a symlink inside the vault rather than replacing it", async () => {
    const { path, destination } = await vault({ text: renderText });
    await mkdir(join(path, "days"), { recursive: true });
    await writeFile(join(path, "days", "monday.md"), "# Monday\n");
    await symlink(join(path, "days", "monday.md"), join(path, "daily.md"));

    await destination.deliver(
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md" },
      }),
    );

    // The real file got it, and the link is still a link.
    expect(await readFile(join(path, "days", "monday.md"), "utf8")).toBe(
      "# Monday\n\na thought\n",
    );
    expect((await lstat(join(path, "daily.md"))).isSymbolicLink()).toBe(true);
  });

  it("appends at the end when the arguments name no heading", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "daily.md"), "# Monday\n");

    await destination.deliver(
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md" },
      }),
    );

    expect(await readFile(join(path, "daily.md"), "utf8")).toBe(
      "# Monday\n\na thought\n",
    );
  });

  it("writes the heading itself when the file has none", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "daily.md"), "# Monday\n");

    await destination.deliver(
      delivery({
        capability: "append-to-file",
        arguments: { path: "daily.md", heading: "Captured" },
      }),
    );

    expect(await readFile(join(path, "daily.md"), "utf8")).toBe(
      "# Monday\n\n## Captured\n\na thought\n",
    );
  });
});

describe("assets", () => {
  it("land beside the note under the names they were uploaded with", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });
    const photo = deliveredAsset("image", "photo.png", bytes("PNG"));

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "inbox", filename: "a.md" },
        assets: [photo],
      }),
    );

    expect(await filesUnder(path)).toEqual(["inbox/a.md", "inbox/photo.png"]);
    expect(await readFile(join(path, "inbox", "photo.png"), "utf8")).toBe(
      "PNG",
    );
    expect(await readFile(join(path, "inbox", "a.md"), "utf8")).toContain(
      "![](photo.png)",
    );
  });

  it("suffixes the second of two sharing one name, rather than losing it", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [
          deliveredAsset("one", "photo.png", bytes("first")),
          deliveredAsset("two", "photo.png", bytes("second")),
        ],
      }),
    );

    expect(await filesUnder(path)).toEqual([
      "a.md",
      "photo-1.png",
      "photo.png",
    ]);
    expect(await readFile(join(path, "photo.png"), "utf8")).toBe("first");
    expect(await readFile(join(path, "photo-1.png"), "utf8")).toBe("second");
  });

  it("steps around a file the vault already had, rather than replacing it", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });
    await writeFile(join(path, "photo.png"), "theirs");

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "photo.png", bytes("ours"))],
      }),
    );

    expect(await readFile(join(path, "photo.png"), "utf8")).toBe("theirs");
    expect(await readFile(join(path, "photo-1.png"), "utf8")).toBe("ours");
  });

  it("links an asset whose name has spaces so the link still resolves", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [
          deliveredAsset("one", "Screenshot 2026-08-14.png", bytes("ours")),
        ],
      }),
    );

    // A bare destination would end at the first space, taking the link with it.
    expect(await readFile(join(path, "a.md"), "utf8")).toContain(
      "![](<Screenshot 2026-08-14.png>)",
    );
  });

  it("flattens an asset filename that is a path out of the destination", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "../../authorized_keys", bytes("ours"))],
      }),
    );

    expect(await filesUnder(path)).toEqual(["a.md", "authorized_keys"]);
    expect(await filesUnder(join(path, ".."))).toEqual([
      "vault/a.md",
      "vault/authorized_keys",
    ]);
  });

  it("opens no stream for a delivery carrying no assets", async () => {
    const { destination } = await vault({ text: renderText });
    const unread = deliveredAsset("image", "photo.png", bytes("PNG"));

    await destination.deliver(
      delivery({ arguments: { directory: "", filename: "a.md" } }),
    );

    expect(unread.opens()).toBe(0);
  });

  it("round-trips bytes that are not valid UTF-8", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });
    const raw = new Uint8Array([0xff, 0xfe, 0x00, 0x41]);

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "raw.bin", raw)],
      }),
    );

    expect(new Uint8Array(await readFile(join(path, "raw.bin")))).toEqual(raw);
  });
});

describe("a root that is not there", () => {
  it("is unreachable, so the delivery is retried rather than given up on", async () => {
    const { destination } = await noVault();

    expect(await destination.deliver(delivery())).toMatchObject({
      kind: "unreachable",
    });
  });

  it("is not created on the way past", async () => {
    const { path, destination } = await noVault();
    await destination.deliver(delivery());

    expect(await filesUnder(path)).toEqual([]);
  });
});

describe("the root a person wrote", () => {
  it("takes ~ for their home rather than a folder named ~", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(join(made.path, "notes"), { recursive: true });

    const home = process.env["HOME"];
    process.env["HOME"] = made.path;
    try {
      const destination = bind("~/notes", [TEXT], { text: renderText });
      expect(
        await destination.deliver(
          delivery({ arguments: { directory: "", filename: "a.md" } }),
        ),
      ).toMatchObject({ kind: "delivered" });
      expect(await filesUnder(join(made.path, "notes"))).toEqual(["a.md"]);
    } finally {
      if (home === undefined) delete process.env["HOME"];
      else process.env["HOME"] = home;
    }
  });

  it("resolves a relative one against where the daemon runs, once", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });

    const where = process.cwd();
    process.chdir(made.path);
    try {
      const destination = bind(".", [TEXT], { text: renderText });
      expect(
        await destination.deliver(
          delivery({ arguments: { directory: "", filename: "a.md" } }),
        ),
      ).toMatchObject({ kind: "delivered" });
    } finally {
      process.chdir(where);
    }
    expect(await filesUnder(made.path)).toEqual(["a.md"]);
  });
});

describe("a root that cannot be written", () => {
  it("is unreachable too: a permission bit that is fixed makes the delivery land", async () => {
    const { path, destination } = await vault({ text: renderText });
    await chmod(path, 0o500);

    const refused = await destination.deliver(
      delivery({ arguments: { directory: "inbox", filename: "a.md" } }),
    );
    expect(refused).toMatchObject({ kind: "unreachable" });

    await chmod(path, 0o700);
    expect(
      await destination.deliver(
        delivery({ arguments: { directory: "inbox", filename: "a.md" } }),
      ),
    ).toMatchObject({ kind: "delivered" });
  });
});

describe("a capability it never declared", () => {
  it("is rejected, since no later attempt will grow one", async () => {
    const { destination } = await vault();

    expect(
      await destination.deliver(delivery({ capability: "post-to-board" })),
    ).toMatchObject({ kind: "rejected" });
  });
});

describe("a root that overlaps notemap's own state", () => {
  it("reports unusable where the root names reserved state exactly", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const destination = bind(made.path, [TEXT], {}, [made.path]);

    await expect(destination.describe()).rejects.toThrow(Unusable);
  });

  it("reports unusable where the root sits inside reserved state", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    const nested = join(made.path, "vault");
    await mkdir(nested, { recursive: true });
    const destination = bind(nested, [TEXT], {}, [made.path]);

    await expect(destination.describe()).rejects.toThrow(Unusable);
  });

  it("reports unusable where the root contains reserved state", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    const reserved = join(made.path, "state");
    await mkdir(reserved, { recursive: true });
    const destination = bind(made.path, [TEXT], {}, [reserved]);

    await expect(destination.describe()).rejects.toThrow(Unusable);
  });

  it("delivers nothing, refusing rather than writing into it", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const destination = bind(made.path, [TEXT], {}, [made.path]);

    const outcome = await destination.deliver(delivery());

    expect(outcome).toMatchObject({ kind: "rejected" });
    expect(await filesUnder(made.path)).toEqual([]);
  });

  it("catches a root reached through a symlink into reserved state", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    const reserved = join(made.path, "state");
    await mkdir(reserved, { recursive: true });
    const link = join(made.path, "vault");
    await symlink(reserved, link);
    const destination = bind(link, [TEXT], {}, [reserved]);

    const outcome = await destination.deliver(delivery());

    expect(outcome).toMatchObject({ kind: "rejected" });
    expect(await filesUnder(reserved)).toEqual([]);
  });

  it("leaves an unrelated root alone", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const elsewhere = join(made.path, "..", "reserved-elsewhere");
    const destination = bind(made.path, [TEXT], {}, [elsewhere]);

    await expect(destination.describe()).resolves.toMatchObject({
      capabilities: expect.any(Array),
    });
  });
});
