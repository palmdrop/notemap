import { describe, expect, it } from "vitest";

import { walk, type Entry } from "./walking";

function file(
  name: string,
): Entry & { file: (ok: (file: File) => void) => void } {
  return {
    name,
    isDirectory: false,
    file: (ok) => {
      ok(new File([name], name));
    },
  };
}

/** A folder whose reader answers `size` entries a batch, as Chrome answers a hundred. */
function folder(name: string, inside: Entry[], size = 2): Entry {
  return {
    name,
    isDirectory: true,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok: (entries: Entry[]) => void) => {
          const batch = inside.slice(at, at + size);
          at += batch.length;
          ok(batch);
        },
      };
    },
  } as Entry;
}

const names = (files: readonly File[]) => files.map((one) => one.name);

describe("walk", () => {
  it("reads through folders and their own folders, in the order each was listed", async () => {
    const walked = await walk([
      folder("notes", [
        file("a.md"),
        folder("pictures", [file("b.png"), file("c.png"), file("d.png")]),
        file("e.md"),
      ]),
      file("f.pdf"),
    ]);

    expect(names(walked.files)).toEqual([
      "a.md",
      "b.png",
      "c.png",
      "d.png",
      "e.md",
      "f.pdf",
    ]);
    expect(walked).toMatchObject({ hidden: 0, over: false });
  });

  it("takes a file the browser offered no entry for as it is", async () => {
    const plain = new File(["x"], "plain.txt");
    expect((await walk([plain])).files).toEqual([plain]);
  });

  it("leaves out what is hidden inside a folder, a hidden folder counting once", async () => {
    const walked = await walk([
      folder("project", [
        file(".DS_Store"),
        folder(".git", [file("HEAD"), file("config")]),
        file("readme.md"),
      ]),
    ]);

    expect(names(walked.files)).toEqual(["readme.md"]);
    expect(walked.hidden).toBe(2);
  });

  it("takes a hidden file or folder dropped by name", async () => {
    const walked = await walk([
      file(".env.example"),
      folder(".notes", [file("a.md")]),
    ]);
    expect(names(walked.files)).toEqual([".env.example", "a.md"]);
  });

  it("stops at the ceiling, with more still unread", async () => {
    const many = folder(
      "many",
      Array.from({ length: 5 }, (_, at) => file(`${String(at)}.md`)),
    );

    const over = await walk([many], 4);
    expect(over.over).toBe(true);
    expect(over.files).toHaveLength(4);

    expect((await walk([many], 5)).over).toBe(false);
  });

  it("stops listing a folder once the ceiling is reached", async () => {
    let batches = 0;
    const inside = Array.from({ length: 10 }, (_, at) =>
      file(`${String(at)}.md`),
    );
    const listed = {
      name: "big",
      isDirectory: true,
      createReader: () => {
        let at = 0;
        return {
          readEntries: (ok: (entries: Entry[]) => void) => {
            batches += 1;
            const batch = inside.slice(at, at + 2);
            at += batch.length;
            ok(batch);
          },
        };
      },
    } as Entry;

    expect((await walk([listed], 3)).over).toBe(true);
    expect(batches).toBe(2);
  });

  it("fails where a file cannot be read", async () => {
    const unreadable = {
      name: "locked",
      isDirectory: false,
      file: (_ok: unknown, fail: (error: unknown) => void) => {
        fail(new Error("NotReadableError"));
      },
    } as Entry;
    await expect(walk([unreadable])).rejects.toThrow("NotReadableError");
  });
});
