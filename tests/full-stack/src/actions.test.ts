import { describe, expect, it } from "vitest";

import { daemons, MANUAL } from "./harness/index.ts";

const daemon = daemons();

/** One more than the page the client asks for, so a second page has to exist. */
const TAGS = 25;

describe("the action log", () => {
  it("walks page to page on a position the client read out of the daemon's own answer", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "the one thing that happened",
    });
    for (let nth = 0; nth < TAGS; nth += 1) {
      await client.tag(captured.id, `kind/${String(nth)}`);
    }
    await client.drain();

    const first = await client.actions.read({ order: "oldest-first" });
    expect(first.values).toHaveLength(TAGS);
    expect(first.after).toBeDefined();

    const second = await client.actions.read({
      order: "oldest-first",
      after: first.after,
    });
    expect(second.after).toBeUndefined();

    // The position continued the walk rather than starting it again.
    const walked = [...first.values, ...second.values].map(
      (action) => action.id,
    );
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked).toHaveLength(TAGS + 1);
    expect(first.values[0]?.kind).toBe("captured");
  });

  it("narrows to a subject, and answers nothing for one the pool never held", async () => {
    const running = await daemon();
    const client = running.client;

    const captured = await client.capture({
      channel: MANUAL,
      text: "about this one",
    });
    await client.capture({ channel: MANUAL, text: "about another" });
    await client.drain();

    const narrowed = await client.actions.read({
      order: "newest-first",
      item: captured.id,
    });
    expect(narrowed.values.map((action) => action.subject)).toEqual([
      captured.id,
    ]);

    // The log outlives the material, so an id no item has is a filter, not a refusal.
    await expect(
      client.actions.read({ order: "newest-first", item: "never-existed" }),
    ).resolves.toEqual({ values: [] });
  });
});
