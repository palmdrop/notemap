import { mkdir, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { contain, overlapsAny, realRootOf } from "./paths";
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

describe("overlapping reserved state", () => {
  it("is undefined where nothing reserved is anywhere near the root", () => {
    expect(overlapsAny("/vault", ["/var/lib/notemap/state"])).toBeUndefined();
  });

  it("names the reserved path a root sits inside of", () => {
    expect(
      overlapsAny("/var/lib/notemap/state/deeper", [
        "/var/lib/notemap/state",
        "/var/lib/notemap/assets",
      ]),
    ).toBe("/var/lib/notemap/state");
  });

  it("names the reserved path a root contains", () => {
    expect(overlapsAny("/var/lib/notemap", ["/var/lib/notemap/assets"])).toBe(
      "/var/lib/notemap/assets",
    );
  });

  it("catches the root naming reserved state exactly", () => {
    expect(
      overlapsAny("/var/lib/notemap/assets", ["/var/lib/notemap/assets"]),
    ).toBe("/var/lib/notemap/assets");
  });

  it("resolves `~` and relative segments before comparing", () => {
    const home = homedir();
    expect(
      overlapsAny("~/vaults/../../lib/notemap/assets", [
        join(home, "..", "lib", "notemap", "assets"),
      ]),
    ).toBe(join(home, "..", "lib", "notemap", "assets"));
  });
});
