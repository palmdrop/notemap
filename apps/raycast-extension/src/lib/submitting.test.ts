import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "@notemap/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { submitting, type Form, type Values } from "./submitting";

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "notemap-raycast-"));
});

afterEach(() => rm(directory, { recursive: true, force: true }));

type Answers = {
  readonly capture?: () => Promise<{ readonly id: string }>;
  readonly tag?: () => Promise<void>;
  /** How many operations are still waiting when the form asks. */
  readonly waiting?: number;
  readonly drain?: () => Promise<void>;
};

/** What the form did, in the order it did it, which is half of what is asserted here. */
type Watched = {
  readonly form: Form;
  readonly done: readonly string[];
  readonly said: readonly [string, string][];
  readonly tagged: readonly string[];
};

function watching(answers: Answers = {}): Watched {
  const done: string[] = [];
  const said: [string, string][] = [];
  const tagged: string[] = [];

  const client = {
    attach: () => Promise.resolve("asset-1"),
    capture: answers.capture ?? (() => Promise.resolve({ id: "item-1" })),
    tag: (_item: string, tag: string) => {
      tagged.push(tag);
      return (answers.tag ?? (() => Promise.resolve()))();
    },
    detach: () => Promise.resolve(),
    drain: answers.drain ?? (() => Promise.resolve()),
    waiting: {
      subscribe: (to: (count: number) => void) => {
        to(answers.waiting ?? 0);
        return { unsubscribe: () => undefined };
      },
    },
    close: () => {
      done.push("closed");
      return Promise.resolve();
    },
  } as unknown as Client;

  return {
    done,
    said,
    tagged,
    form: {
      open: () => client,
      failing: (title, message) => {
        said.push([title, message]);
      },
      leaving: (line) => {
        done.push(line);
        return Promise.resolve();
      },
      // Short enough that a test waiting it out is not a test anybody waits for.
      settleMs: 20,
    },
  };
}

async function aFile(name: string): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, "bytes");
  return path;
}

const typed = (values: Partial<Values> = {}): Values => ({
  text: "a note",
  tags: [],
  newTags: "",
  files: [],
  ...values,
});

describe("what the capture form does with what it holds", () => {
  it("says the pool has it, once nothing is left waiting", async () => {
    const watched = watching({ waiting: 0 });

    await submitting(watched.form, typed({ files: [await aFile("shot.png")] }));

    // Closed before the line that leaves the form: leaving ends the process.
    expect(watched.done[0]).toBe("closed");
    expect(watched.done[1]).toBe("Captured — a note");
    expect(watched.said).toEqual([]);
  });

  it("says it is waiting to send where the pool did not answer in time", async () => {
    const watched = watching({ waiting: 1 });

    await submitting(watched.form, typed());

    expect(watched.done).toContain("Waiting to send — a note");
  });

  it("stays on the form where nothing was captured, saying why", async () => {
    const watched = watching({
      capture: () => Promise.reject(new Error("the store would not write")),
    });

    await submitting(watched.form, typed());

    expect(watched.said).toEqual([
      ["Nothing was captured", "the store would not write"],
    ]);
    // Nothing left the form, so the words are still there to try again with.
    expect(watched.done).toEqual(["closed"]);
  });

  it("says a capture was made in part where a tag could not be applied", async () => {
    const watched = watching({
      tag: () => Promise.reject(new Error("no such tag")),
    });

    await submitting(watched.form, typed({ tags: ["reading"] }));

    expect(watched.done[0]).toBe("closed");
    expect(watched.done[1]).toBe("Captured, but not all of it — a note");
  });

  it("says as much where the capture landed and something after it threw", async () => {
    const watched = watching({
      waiting: 0,
      // What `landing` asks of a client that is already closing.
      drain: () => Promise.reject(new Error("the drain went nowhere")),
    });

    await submitting(watched.form, typed());

    expect(watched.done).toEqual([
      "closed",
      "Captured, but not all of it — a note",
    ]);
  });

  it("applies the tags it was picked and the tags that were typed, once each", async () => {
    const watched = watching();

    await submitting(
      watched.form,
      typed({ tags: ["reading"], newTags: "later, reading" }),
    );

    expect(watched.tagged).toEqual(["reading", "later"]);
  });

  it("says the note is short enough to read in a line", async () => {
    const watched = watching({ waiting: 0 });

    await submitting(watched.form, typed({ text: `${"a".repeat(80)}\nmore` }));

    expect(watched.done[1]).toBe(`Captured — ${"a".repeat(59)}…`);
  });
});
