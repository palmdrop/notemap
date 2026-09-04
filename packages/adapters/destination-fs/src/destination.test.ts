import {
  chmod,
  lstat,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { Rejected, Unusable } from "@notemap/core";
import type {
  DeliveredOutput,
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
  JsonObject,
  PayloadTypeName,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemDestination } from "./destination";
import {
  APPEND_TO_FILE,
  CREATE_OR_APPEND_FILE,
  linkTo,
  type Renderer,
} from "@notemap/output-markdown";
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

function delivered(
  outcome: DeliveryOutcome,
): DeliveryOutcome & { kind: "delivered" } {
  if (outcome.kind !== "delivered") {
    throw new Error(`not delivered: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/** What the destination said it wrote, read back as text. */
async function outputOf(
  outcome: DeliveryOutcome,
): Promise<{ mediaType: string; text: string }> {
  return textOf(delivered(outcome).output);
}

async function textOf(
  output: DeliveredOutput | undefined,
): Promise<{ mediaType: string; text: string }> {
  const content = output?.content;
  if (content === undefined) throw new Error("it answered no content");

  const chunks: Uint8Array[] = [];
  for await (const chunk of await content.open()) chunks.push(chunk);

  return {
    mediaType: content.mediaType,
    text: chunks.map((chunk) => new TextDecoder().decode(chunk)).join(""),
  };
}

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
  preview(delivery: Delivery): Promise<DeliveredOutput>;
  probe(): Promise<void>;
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
    preview: (each) =>
      kind.preview?.(row, each) ??
      Promise.reject(new Error("the kind offers no preview")),
    probe: () => kind.probe?.(row) ?? Promise.resolve(),
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
  it("declares all three capabilities over the payload types it was given", async () => {
    const { destination } = await vault();
    const described = await destination.describe();

    expect(described.capabilities.map((each) => each.name)).toEqual([
      "create-or-append-file",
      "create-file",
      "append-to-file",
    ]);
    expect(described.capabilities[0]?.accepts).toEqual([TEXT, "image"]);
    expect(described.capabilities[2]?.argumentsSchema).toMatchObject({
      required: ["path"],
    });
  });

  it("asks nothing of create-or-append-file but offers candidates for its path", async () => {
    const { destination } = await vault();
    const described = await destination.describe();
    const schema = described.capabilities[0]?.argumentsSchema as JsonObject;

    expect(schema["required"]).toBeUndefined();
    expect(schema["properties"]).toMatchObject({
      path: { "x-notemap-candidates": true },
      heading: {},
    });
    expect((schema["properties"] as JsonObject)["heading"]).not.toHaveProperty(
      "x-notemap-candidates",
    );
  });

  /** The schema used to demand a folder the adapter has always read as the root. */
  it("no longer requires create-file's directory", async () => {
    const { destination } = await vault();
    const described = await destination.describe();

    expect(described.capabilities[1]?.argumentsSchema).not.toHaveProperty(
      "required",
    );
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

    expect(outcome).toMatchObject({
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

describe("what it says it wrote", () => {
  it("answers the whole note it created, and nothing to confess", async () => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      delivery({ arguments: { directory: "inbox", filename: "a-thought.md" } }),
    );

    const written = await readFile(join(path, "inbox", "a-thought.md"), "utf8");
    expect(await outputOf(outcome)).toEqual({
      mediaType: "text/markdown",
      text: written,
    });
    expect(delivered(outcome).output?.note).toBeUndefined();
    // A path on this host is nowhere the shell can follow.
    expect(delivered(outcome).url).toBeUndefined();
  });

  it("answers what an append inserted, not the note it was inserted into", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "log.md"), "# Log\n\nyesterday\n");

    const outcome = await destination.deliver(
      delivery({
        capability: APPEND_TO_FILE,
        arguments: { path: "log.md" },
        content: { text: "a thought" },
      }),
    );

    expect((await outputOf(outcome)).text).toBe("a thought\n");
    expect(await readFile(join(path, "log.md"), "utf8")).toContain("yesterday");
  });

  it("answers the whole note where the append brought one into being", async () => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      delivery({ capability: APPEND_TO_FILE, arguments: { path: "log.md" } }),
    );

    const written = await readFile(join(path, "log.md"), "utf8");
    expect((await outputOf(outcome)).text).toBe(written);
    expect(written).toContain("id: 'item-1'");
  });

  it("answers the inserted fragment for the capability that decides at delivery", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "log.md"), "# Log\n\nyesterday\n");

    const outcome = await destination.deliver(
      delivery({
        capability: CREATE_OR_APPEND_FILE,
        arguments: { path: "log.md" },
      }),
    );

    expect((await outputOf(outcome)).text).toBe("a thought\n");
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

describe("creating or appending, decided here", () => {
  const asked = (args: Record<string, string>) =>
    delivery({ capability: "create-or-append-file", arguments: args });

  it("creates the note when it is not there", async () => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      asked({ path: "notes/decisions.md" }),
    );

    expect(outcome).toMatchObject({ pointer: "notes/decisions.md" });
    const written = await readFile(join(path, "notes", "decisions.md"), "utf8");
    expect(written).toContain("id: 'item-1'");
    expect(written).toContain("a thought");
  });

  it("appends to the note when it is already there", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "decisions.md"), "an earlier line\n");

    const outcome = await destination.deliver(asked({ path: "decisions.md" }));

    expect(outcome).toMatchObject({ pointer: "decisions.md" });
    expect(await readFile(join(path, "decisions.md"), "utf8")).toBe(
      "an earlier line\n\na thought\n",
    );
  });

  it("makes a folder that is not there", async () => {
    const { path, destination } = await vault({ text: renderText });

    await destination.deliver(asked({ path: "projects/notemap/drafts/a.md" }));

    expect(await filesUnder(path)).toEqual(["projects/notemap/drafts/a.md"]);
  });

  it("derives the filename from a path that ends in a slash", async () => {
    const { destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(
      delivery({
        capability: "create-or-append-file",
        arguments: { path: "drafts/" },
        content: { text: "Read: Borges — Ficciones\nand then the rest" },
      }),
    );

    expect(outcome).toMatchObject({
      pointer: "drafts/Read- Borges - Ficciones.md",
    });
  });

  /** Without the slash there is nothing to tell a new folder from an extensionless note. */
  it("reads the same name without a slash as the note itself", async () => {
    const { path, destination } = await vault({ text: renderText });

    await destination.deliver(asked({ path: "drafts" }));

    expect(await filesUnder(path)).toEqual(["drafts"]);
  });

  it("derives into the root when the path is empty", async () => {
    const { destination } = await vault({ text: renderText });

    expect(
      await destination.deliver(
        delivery({
          capability: "create-or-append-file",
          arguments: { path: "" },
          content: { count: 4 },
        }),
      ),
    ).toMatchObject({ pointer: "item-1.md" });
  });

  it("inserts under a heading that is already in the note", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(
      join(path, "daily.md"),
      ["## Notes", "", "an earlier line", "", "## Later", "", "after", ""].join(
        "\n",
      ),
    );

    await destination.deliver(asked({ path: "daily.md", heading: "Notes" }));

    expect(await readFile(join(path, "daily.md"), "utf8")).toBe(
      [
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

  it("writes the heading itself when the note is new", async () => {
    const { path, destination } = await vault({ text: renderText });

    await destination.deliver(asked({ path: "daily.md", heading: "Notes" }));

    expect(await readFile(join(path, "daily.md"), "utf8")).toContain(
      "## Notes\n\na thought\n",
    );
  });

  it("refuses a path that leaves the root", async () => {
    const { path, destination } = await vault({ text: renderText });

    const outcome = await destination.deliver(asked({ path: "../escaped.md" }));

    expect(outcome.kind).toBe("rejected");
    expect(await filesUnder(path)).toEqual([]);
  });
});

describe("assets", () => {
  const ONE = "a".repeat(64);
  const TWO = "b".repeat(64);

  it("land beside the note, named for the upload and for what is in them", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });
    const photo = deliveredAsset("image", "photo.png", bytes("PNG"), ONE);

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "inbox", filename: "a.md" },
        assets: [photo],
      }),
    );

    expect(await filesUnder(path)).toEqual([
      "inbox/a.md",
      "inbox/photo-aaaaaaaa.png",
    ]);
    expect(
      await readFile(join(path, "inbox", "photo-aaaaaaaa.png"), "utf8"),
    ).toBe("PNG");
    expect(await readFile(join(path, "inbox", "a.md"), "utf8")).toContain(
      "![](photo-aaaaaaaa.png)",
    );
  });

  it("tells two sharing one uploaded name apart by their content", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [
          deliveredAsset("one", "photo.png", bytes("first"), ONE),
          deliveredAsset("two", "photo.png", bytes("second"), TWO),
        ],
      }),
    );

    expect(await filesUnder(path)).toEqual([
      "a.md",
      "photo-aaaaaaaa.png",
      "photo-bbbbbbbb.png",
    ]);
    expect(await readFile(join(path, "photo-aaaaaaaa.png"), "utf8")).toBe(
      "first",
    );
    expect(await readFile(join(path, "photo-bbbbbbbb.png"), "utf8")).toBe(
      "second",
    );
  });

  it("steps around a file the vault already had, rather than replacing it", async () => {
    const { path, destination } = await vault({ image: renderWithAssets });
    await writeFile(join(path, "photo.png"), "theirs");

    await destination.deliver(
      delivery({
        type: "image" as PayloadTypeName,
        arguments: { directory: "", filename: "a.md" },
        assets: [deliveredAsset("one", "photo.png", bytes("ours"), ONE)],
      }),
    );

    expect(await readFile(join(path, "photo.png"), "utf8")).toBe("theirs");
    expect(await readFile(join(path, "photo-aaaaaaaa.png"), "utf8")).toBe(
      "ours",
    );
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
      "![](<Screenshot 2026-08-14-00000000.png>)",
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

    expect(await filesUnder(path)).toEqual([
      "a.md",
      "authorized_keys-00000000",
    ]);
    expect(await filesUnder(join(path, ".."))).toEqual([
      "vault/a.md",
      "vault/authorized_keys-00000000",
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

    expect(
      new Uint8Array(await readFile(join(path, "raw-00000000.bin"))),
    ).toEqual(raw);
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

describe("probing a filesystem destination", () => {
  it("resolves for a root that is there and can be written to", async () => {
    const { destination } = await vault();

    await expect(destination.probe()).resolves.toBeUndefined();
  });

  it("rejects a root that is not there", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    const kind = createFilesystemDestination({ accepts: [TEXT] });

    await expect(
      kind.probe?.(destinationRow({ root: join(made.path, "nowhere") })),
    ).rejects.toThrow(/is not there/);
  });

  it("rejects a root that is a file rather than a folder", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const note = join(made.path, "a-note.md");
    await writeFile(note, "not a folder\n");
    const kind = createFilesystemDestination({ accepts: [TEXT] });

    await expect(kind.probe?.(destinationRow({ root: note }))).rejects.toThrow(
      /is not a directory/,
    );
  });

  /** Skipped as root, which can write anywhere: the premise fails, not the probe. */
  it.skipIf(process.getuid?.() === 0)(
    "rejects a root that cannot be written to",
    async () => {
      const made = root();
      cleanups.push(made.cleanup);
      await mkdir(made.path, { recursive: true });
      await chmod(made.path, 0o500);
      cleanups.push(() => void chmod(made.path, 0o700).catch(() => undefined));
      const kind = createFilesystemDestination({ accepts: [TEXT] });

      await expect(
        kind.probe?.(destinationRow({ root: made.path })),
      ).rejects.toThrow(/cannot be written to/);
    },
  );

  /**
   * The sorting a delivery already does: those five errnos are the machine's,
   * and everything else — a component that is a file — is a person's to fix.
   */
  it("rejects a root whose parent is a file rather than a folder", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const note = join(made.path, "a-note.md");
    await writeFile(note, "not a folder\n");
    const kind = createFilesystemDestination({ accepts: [TEXT] });

    await expect(
      kind.probe?.(destinationRow({ root: join(note, "inside") })),
    ).rejects.toThrow(Rejected);
  });

  it.skipIf(process.getuid?.() === 0)(
    "is unreachable, not rejected, where the root cannot be read at all",
    async () => {
      const made = root();
      const shut = join(made.path, "shut");
      await mkdir(join(shut, "vault"), { recursive: true });
      // Restored before the directory is removed, or the removal cannot read it.
      cleanups.push(async () => {
        await chmod(shut, 0o700).catch(() => undefined);
        made.cleanup();
      });
      await chmod(shut, 0o000);
      const kind = createFilesystemDestination({ accepts: [TEXT] });

      const failed = await kind
        .probe?.(destinationRow({ root: join(shut, "vault") }))
        .then(() => undefined)
        .catch((cause: unknown) => cause);

      expect(failed).toBeInstanceOf(Error);
      expect(failed).not.toBeInstanceOf(Rejected);
    },
  );

  it("is unusable where the root overlaps notemap's own state", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const kind = createFilesystemDestination({
      accepts: [TEXT],
      reserved: [made.path],
    });

    await expect(
      kind.probe?.(destinationRow({ root: made.path })),
    ).rejects.toThrow(Unusable);
  });
});

describe("what it says it would write", () => {
  it("answers the note a create would land, and writes nothing at all", async () => {
    const { path, destination } = await vault({ text: renderText });
    const each = delivery({
      arguments: { directory: "inbox", filename: "a-thought.md" },
      tags: ["kind/quote"],
    });

    const shown = await textOf(await destination.preview(each));

    expect(await filesUnder(path)).toEqual([]);
    expect(shown.mediaType).toBe("text/markdown");
    expect(shown.text).toContain("a thought");
    expect(shown.text).toContain("- 'kind/quote'");

    // What was shown is what the same delivery then writes.
    const outcome = await destination.deliver(each);
    expect((await outputOf(outcome)).text).toBe(shown.text);
    expect(await readFile(join(path, "inbox", "a-thought.md"), "utf8")).toBe(
      shown.text,
    );
  });

  it("answers what an append would insert, leaving the note as it was", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "log.md"), "# Log\n\nyesterday\n");
    const each = delivery({
      capability: APPEND_TO_FILE,
      arguments: { path: "log.md" },
    });

    const shown = await textOf(await destination.preview(each));

    expect(shown.text).toBe("a thought\n");
    expect(await readFile(join(path, "log.md"), "utf8")).toBe(
      "# Log\n\nyesterday\n",
    );
    expect((await outputOf(await destination.deliver(each))).text).toBe(
      shown.text,
    );
  });

  it("shows the whole note where the append would bring one into being", async () => {
    const { path, destination } = await vault({ text: renderText });

    const shown = await textOf(
      await destination.preview(
        delivery({ capability: APPEND_TO_FILE, arguments: { path: "log.md" } }),
      ),
    );

    expect(shown.text).toContain("id: 'item-1'");
    expect(await filesUnder(path)).toEqual([]);
  });

  it("places no assets, and links them by the names they would land under", async () => {
    const { path, destination } = await vault({ text: renderWithAssets });
    const picture = deliveredAsset("image", "photo.png", bytes("png"));

    const shown = await textOf(
      await destination.preview(
        delivery({
          arguments: { directory: "", filename: "a.md" },
          assets: [picture],
        }),
      ),
    );

    expect(shown.text).toContain("photo");
    expect(await filesUnder(path)).toEqual([]);
    // A name is arithmetic on the asset, so nothing had to be read to say it.
    expect(picture.opens()).toBe(0);
  });

  it("answers a root that is a file the way a delivery does", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path.split("/").slice(0, -1).join("/"), {
      recursive: true,
    });
    await writeFile(made.path, "a note, where a folder should be\n");
    const destination = bind(made.path, [TEXT], {});
    const each = delivery({ arguments: { directory: "", filename: "a.md" } });

    const outcome = await destination.deliver(each);
    const shown = await destination.preview(each).then(
      () => "answered",
      (cause: unknown) => cause,
    );

    // Unreachable from the delivery, so not a refusal from the preview.
    expect(outcome).toMatchObject({ kind: "unreachable" });
    expect(shown).not.toBe("answered");
    expect(shown).not.toBeInstanceOf(Rejected);
  });

  it("says a create would be refused where the name is taken", async () => {
    const { path, destination } = await vault({ text: renderText });
    await writeFile(join(path, "a.md"), "theirs\n");

    await expect(
      destination.preview(
        delivery({ arguments: { directory: "", filename: "a.md" } }),
      ),
    ).rejects.toThrow(Rejected);
  });

  it("cannot be shown against a root that is not there", async () => {
    const { destination } = await noVault();

    await expect(
      destination.preview(
        delivery({ arguments: { directory: "", filename: "a.md" } }),
      ),
    ).rejects.toThrow();
  });
});
