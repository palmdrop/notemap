import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { alternatives, contain, oneSegment, realRootOf } from "./paths";
import { root } from "./testing/fixture";

const roots: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of roots.splice(0)) cleanup();
});

async function vault(): Promise<string> {
  const made = root();
  roots.push(made.cleanup);
  await mkdir(made.path, { recursive: true });
  return realRootOf(made.path);
}

describe("containment", () => {
  it("accepts a path inside the root, and states it relative to it", async () => {
    const path = await vault();
    const contained = await contain(path, "inbox/a-thought.md");

    expect(contained).toEqual({
      kind: "contained",
      path: {
        absolute: join(path, "inbox", "a-thought.md"),
        relative: "inbox/a-thought.md",
      },
    });
  });

  it("refuses an absolute target rather than re-rooting it", async () => {
    const path = await vault();
    expect(await contain(path, "/etc/passwd")).toMatchObject({
      kind: "refused",
    });
  });

  it("refuses every arrangement of `..` that leaves", async () => {
    const path = await vault();

    for (const target of [
      "../outside.md",
      "inbox/../../outside.md",
      "a/b/../../../outside.md",
      "..",
    ]) {
      expect(await contain(path, target)).toMatchObject({ kind: "refused" });
    }
  });

  it("allows `..` that stays inside, since nothing escaped", async () => {
    const path = await vault();
    expect(await contain(path, "inbox/../notes/a.md")).toMatchObject({
      kind: "contained",
      path: { relative: "notes/a.md" },
    });
  });

  it("refuses a target reached through a symlink out of the root", async () => {
    const path = await vault();
    const outside = join(path, "..", "elsewhere");
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(path, "escape"));

    expect(await contain(path, "escape/a-thought.md")).toMatchObject({
      kind: "refused",
    });
  });

  it("refuses a symlinked file that points out of the root", async () => {
    const path = await vault();
    const outside = join(path, "..", "victim.md");
    await writeFile(outside, "theirs\n");
    await symlink(outside, join(path, "innocent.md"));

    expect(await contain(path, "innocent.md")).toMatchObject({
      kind: "refused",
    });
  });

  it("keeps a symlink that stays inside", async () => {
    const path = await vault();
    await mkdir(join(path, "notes"), { recursive: true });
    await symlink(join(path, "notes"), join(path, "shortcut"));

    expect(await contain(path, "shortcut/a.md")).toMatchObject({
      kind: "contained",
    });
  });

  it("answers an empty relative for the root itself, which no file can have", async () => {
    const path = await vault();
    expect(await contain(path, "")).toMatchObject({
      kind: "contained",
      path: { relative: "" },
    });
  });

  it("refuses a path `node:path` itself will not take", async () => {
    const path = await vault();
    expect(await contain(path, "a\u0000b.md")).toMatchObject({
      kind: "refused",
    });
  });
});

describe("one segment", () => {
  it("flattens a name that was never a name", () => {
    expect(oneSegment("../../authorized_keys", "fallback")).toBe(
      "authorized_keys",
    );
    expect(oneSegment("a/b/c.png", "fallback")).toBe("a b c.png");
  });

  it("falls back where nothing survives", () => {
    expect(oneSegment("..", "fallback")).toBe("fallback");
    expect(oneSegment("   ", "fallback")).toBe("fallback");
    expect(oneSegment("", "fallback")).toBe("fallback");
    expect(oneSegment("###", "fallback")).toBe("fallback");
  });

  it("drops the markers a heading or a bullet begins with", () => {
    expect(oneSegment("# A thought", "fallback")).toBe("A thought");
    expect(oneSegment("## A thought", "fallback")).toBe("A thought");
    expect(oneSegment("- a bullet", "fallback")).toBe("a bullet");
    expect(oneSegment("> a quote", "fallback")).toBe("a quote");
  });

  /** Only the ends: a dash between words is somebody's name for the thing. */
  it("leaves a dash alone in the middle of a name", () => {
    expect(oneSegment("a-thought.md", "fallback")).toBe("a-thought.md");
    expect(oneSegment("Read: Borges", "fallback")).toBe("Read- Borges");
  });

  it("keeps letters of any script, because a filename is the user's", () => {
    expect(oneSegment("Ölandsbron.md", "fallback")).toBe("Ölandsbron.md");
    expect(oneSegment("メモ.md", "fallback")).toBe("メモ.md");
  });
});

describe("alternatives", () => {
  it("keeps the extension while suffixing the stem", () => {
    const [first, second, third] = alternatives("photo.png");
    expect([first, second, third]).toEqual([
      "photo.png",
      "photo-1.png",
      "photo-2.png",
    ]);
  });

  it("suffixes a name with no extension at the end", () => {
    const [, second] = alternatives("README");
    expect(second).toBe("README-1");
  });
});
