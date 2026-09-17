import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "@notemap/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { attaching, chosen, excerpt } from "./note";

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

  it("is nothing where no file was picked", async () => {
    const { client, held } = attaches();

    expect(await attaching(client, [])).toBeUndefined();
    expect(held()).toBeUndefined();
  });

  it("carries the file's own name and the type its suffix reads as", async () => {
    const path = join(directory, "a-screenshot.PNG");
    await writeFile(path, "bytes");
    const { client, held } = attaches();

    await attaching(client, [path]);

    expect(held()?.name).toBe("a-screenshot.PNG");
    expect(held()?.type).toBe("image/png");
  });

  it("leaves the type to the client where the suffix says nothing", async () => {
    const path = join(directory, "notes.unheard-of");
    await writeFile(path, "bytes");
    const { client, held } = attaches();

    await attaching(client, [path]);

    expect(held()?.type).toBe("");
  });
});
