import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  NotOffered,
  Unusable,
  type CandidatesRequest,
  type CapabilityName,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemDestination } from "./destination";
import { destinationRow, root, TEXT } from "./testing/fixture";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** The kind's `candidates`, bound to one destination row, over a real temporary tree. */
function bind(path: string, reserved: readonly string[] = []) {
  const kind = createFilesystemDestination({ accepts: [TEXT], reserved });
  const row = destinationRow({ root: path });

  if (kind.candidates === undefined) {
    throw new Error("the filesystem kind is expected to offer candidates");
  }
  const method = kind.candidates;
  return (request: CandidatesRequest) => method(row, request);
}

async function vault(): Promise<{
  path: string;
  candidates: ReturnType<typeof bind>;
}> {
  const made = root();
  cleanups.push(made.cleanup);
  await mkdir(made.path, { recursive: true });
  return { path: made.path, candidates: bind(made.path) };
}

const DIRECTORY: CandidatesRequest = {
  capability: "create-file" as CapabilityName,
  field: "directory",
};

const PATH: CandidatesRequest = {
  capability: "append-to-file" as CapabilityName,
  field: "path",
};

describe("what create-file's directory offers", () => {
  it("lists folders at the root, and nothing else", async () => {
    const { path, candidates } = await vault();
    await mkdir(join(path, "inbox"));
    await mkdir(join(path, "projects"));
    await writeFile(join(path, "readme.md"), "not a folder");

    const answer = await candidates(DIRECTORY);

    expect(answer).toEqual({
      truncated: false,
      entries: [
        { label: "inbox", value: "inbox", scope: "inbox" },
        { label: "projects", value: "projects", scope: "projects" },
      ],
    });
  });

  it("sorts by name", async () => {
    const { path, candidates } = await vault();
    await mkdir(join(path, "zebra"));
    await mkdir(join(path, "alpha"));

    const answer = await candidates(DIRECTORY);

    expect(answer.entries.map((each) => each.label)).toEqual([
      "alpha",
      "zebra",
    ]);
  });

  it("descends one level from a scope an earlier answer minted", async () => {
    const { path, candidates } = await vault();
    await mkdir(join(path, "projects", "fiction-a"), { recursive: true });
    await mkdir(join(path, "projects", "fiction-b"), { recursive: true });

    const answer = await candidates({ ...DIRECTORY, scope: "projects" });

    expect(answer.entries).toEqual([
      {
        label: "fiction-a",
        value: "projects/fiction-a",
        scope: "projects/fiction-a",
      },
      {
        label: "fiction-b",
        value: "projects/fiction-b",
        scope: "projects/fiction-b",
      },
    ]);
  });

  it("does not recurse past the one level asked for", async () => {
    const { path, candidates } = await vault();
    await mkdir(join(path, "projects", "nested"), { recursive: true });

    const answer = await candidates(DIRECTORY);

    expect(answer.entries).toEqual([
      { label: "projects", value: "projects", scope: "projects" },
    ]);
  });

  it("excludes hidden folders and the temporaries a crashed delivery leaves", async () => {
    const { path, candidates } = await vault();
    await mkdir(join(path, "inbox"));
    await mkdir(join(path, ".obsidian"));
    await mkdir(join(path, ".notemap-a.md.abc123"));

    const answer = await candidates(DIRECTORY);

    expect(answer.entries.map((each) => each.label)).toEqual(["inbox"]);
  });
});

describe("what append-to-file's path offers", () => {
  it("offers notes to take and folders only to walk through", async () => {
    const { path, candidates } = await vault();
    await writeFile(join(path, "daily.md"), "");
    await mkdir(join(path, "inbox"));

    const answer = await candidates(PATH);

    expect(answer).toEqual({
      truncated: false,
      entries: [
        { label: "inbox", scope: "inbox" },
        { label: "daily.md", value: "daily.md" },
      ],
    });
  });

  it("descends into a folder to reach a note that is not at the root", async () => {
    const { path, candidates } = await vault();
    await mkdir(join(path, "projects"));
    await writeFile(join(path, "projects", "fiction.md"), "");

    const answer = await candidates({ ...PATH, scope: "projects" });

    expect(answer.entries).toEqual([
      { label: "fiction.md", value: "projects/fiction.md" },
    ]);
  });

  it("puts the ways down before the notes, so a flat vault does not bury them", async () => {
    const { path, candidates } = await vault();
    await writeFile(join(path, "a-note.md"), "");
    await mkdir(join(path, "z-folder"));

    const answer = await candidates(PATH);

    expect(answer.entries.map((each) => each.label)).toEqual([
      "z-folder",
      "a-note.md",
    ]);
  });

  it("offers no further scope: a note is a leaf", async () => {
    const { path, candidates } = await vault();
    await writeFile(join(path, "daily.md"), "");

    const answer = await candidates(PATH);

    expect(answer.entries[0]?.scope).toBeUndefined();
  });

  it("excludes hidden folders as well as hidden files", async () => {
    const { path, candidates } = await vault();
    await writeFile(join(path, "daily.md"), "");
    await writeFile(join(path, ".DS_Store"), "");
    await mkdir(join(path, ".obsidian"));

    const answer = await candidates(PATH);

    expect(answer.entries.map((each) => each.label)).toEqual(["daily.md"]);
  });
});

describe("the cap", () => {
  it("truncates past the limit and says so", async () => {
    const { path, candidates } = await vault();
    await Promise.all(
      Array.from({ length: 501 }, (_, i) =>
        mkdir(join(path, `folder-${String(i).padStart(4, "0")}`)),
      ),
    );

    const answer = await candidates(DIRECTORY);

    expect(answer.entries).toHaveLength(500);
    expect(answer.truncated).toBe(true);
  });

  it("is not truncated at exactly the limit", async () => {
    const { path, candidates } = await vault();
    await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        mkdir(join(path, `folder-${String(i).padStart(4, "0")}`)),
      ),
    );

    const answer = await candidates(DIRECTORY);

    expect(answer.entries).toHaveLength(500);
    expect(answer.truncated).toBe(false);
  });
});

describe("a scope that leaves the root", () => {
  it("is refused rather than answered", async () => {
    const { candidates } = await vault();

    await expect(
      candidates({ ...DIRECTORY, scope: "../../etc" }),
    ).rejects.toThrow();
  });

  it("is refused where a symlink inside the root leads out of it", async () => {
    const { path, candidates } = await vault();
    const elsewhere = join(path, "..", "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await symlink(elsewhere, join(path, "escape"));

    await expect(
      candidates({ ...DIRECTORY, scope: "escape" }),
    ).rejects.toThrow();
  });
});

describe("a root that is not there", () => {
  it("rejects rather than answering an empty listing", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    const candidates = bind(made.path);

    await expect(candidates(DIRECTORY)).rejects.toThrow();
  });
});

describe("a root that overlaps notemap's own state", () => {
  it("is unusable, the same word describing it gives", async () => {
    const made = root();
    cleanups.push(made.cleanup);
    await mkdir(made.path, { recursive: true });
    const candidates = bind(made.path, [made.path]);

    await expect(candidates(DIRECTORY)).rejects.toThrow(Unusable);
  });
});

describe("a field this kind does not offer candidates for", () => {
  it("is not-offered rather than a failure to reach anything", async () => {
    const { candidates } = await vault();

    await expect(
      candidates({
        capability: "create-file" as CapabilityName,
        field: "filename",
      }),
    ).rejects.toThrow(NotOffered);
  });
});
