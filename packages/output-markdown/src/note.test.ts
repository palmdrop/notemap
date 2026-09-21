import { describe, expect, it } from "vitest";

import type {
  CapabilityName,
  Delivery,
  DestinationId,
  ItemId,
  PayloadTypeName,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";

import { markdownOutput, renderNote, type NoteOptions } from "./note";
import type { Renderer, Renderers } from "./renderers";

const AT = "2026-09-10T09:00:00.000Z" as Timestamp;
const NOTE = "note" as PayloadTypeName;
const SCRATCHPAD = "scratchpad" as SourceId;

function delivery(
  overrides: {
    tags?: readonly string[];
    artifacts?: number;
  } = {},
): Delivery {
  return {
    item: "item-1" as ItemId,
    destination: "vault" as DestinationId,
    capability: "create" as CapabilityName,
    arguments: {},
    source: SCRATCHPAD,
    payload: {
      type: NOTE,
      content: { text: "a thought" },
      metadata: {},
      assets: [],
    },
    tags: (overrides.tags ?? []).map((name) => ({
      name: name as TagName,
      by: { kind: "person" as const },
      addedAt: AT,
    })),
    createdAt: AT,
    artifacts: [],
    assets: [],
  };
}

const prose: Renderer = (given) => ({
  body: `${String(given.payload.content["text"])}\n`,
});

const renderers: Renderers = { [NOTE]: prose };

function options(overrides: Partial<NoteOptions> = {}): NoteOptions {
  return {
    frontmatter: "none",
    hashtags: false,
    triggerTags: false,
    ...overrides,
  };
}

const at = { directory: "", assets: new Map<string, string>() };

describe("where a note carries its tags", () => {
  it("puts them among the frontmatter, where there is one", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote"] }),
      at,
      options({ frontmatter: "full" }),
    );

    expect(note.frontmatter).toContain("tags:\n  - 'quote'");
    expect(note.body).toBe("a thought\n");
  });

  it("writes them at the foot of the note as hashtags, one blank line down", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote", "project/fiction-a"] }),
      at,
      options({ hashtags: true }),
    );

    expect(note.body).toBe("a thought\n\n#quote #project/fiction-a\n");
  });

  /** Both places would be one tag said twice, and the block is the one being turned off. */
  it("takes them out of the frontmatter where the body is carrying them", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote"] }),
      at,
      options({ frontmatter: "full", hashtags: true }),
    );

    expect(note.frontmatter).not.toContain("tags:");
    expect(note.body).toBe("a thought\n\n#quote\n");
  });

  it("carries them nowhere where there is no frontmatter and no hashtags", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote"] }),
      at,
      options(),
    );

    expect(note.frontmatter).toBe("");
    expect(note.body).toBe("a thought\n");
  });
});

describe("the tags that filed the item", () => {
  const filed = delivery({ tags: ["quote", "route/research"] });

  it("stay in the pool, out of the frontmatter as out of the foot", () => {
    const block = renderNote(
      renderers,
      filed,
      at,
      options({ frontmatter: "full" }),
    );
    const foot = renderNote(renderers, filed, at, options({ hashtags: true }));

    expect(block.frontmatter).toContain("tags:\n  - 'quote'\n");
    expect(block.frontmatter).not.toContain("route/");
    expect(foot.body).toBe("a thought\n\n#quote\n");
  });

  it("go where the delivery asked for them, in both places", () => {
    const block = renderNote(
      renderers,
      filed,
      at,
      options({ frontmatter: "full", triggerTags: true }),
    );
    const foot = renderNote(
      renderers,
      filed,
      at,
      options({ hashtags: true, triggerTags: true }),
    );

    expect(block.frontmatter).toContain(
      "tags:\n  - 'quote'\n  - 'route/research'\n",
    );
    expect(foot.body).toBe("a thought\n\n#quote #route/research\n");
  });

  /** A choice rather than a loss, on the same terms as a setting that leaves tags out. */
  it("are not confessed", () => {
    expect(renderNote(renderers, filed, at, options()).dropped).toBeUndefined();
  });

  it("leave a note with no tags line where they were the only tags", () => {
    const only = delivery({ tags: ["route/research"] });
    const block = renderNote(
      renderers,
      only,
      at,
      options({ frontmatter: "full" }),
    );
    const foot = renderNote(renderers, only, at, options({ hashtags: true }));

    expect(block.frontmatter).not.toContain("tags:");
    expect(foot.body).toBe("a thought\n");
  });
});

describe("what a note says it could not carry", () => {
  it("says nothing where there was nothing to leave behind", () => {
    expect(renderNote(renderers, delivery(), at, options()).dropped).toBe(
      undefined,
    );
  });

  /** The default pairing: tags nobody asked to write are the destination's choice, not a loss. */
  it("says nothing of tags the options left out", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote"] }),
      at,
      options(),
    );

    expect(note.dropped).toBe(undefined);
  });

  it("names the tags no hashtag could be made of", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote", "a loose thought"] }),
      at,
      options({ hashtags: true }),
    );

    expect(note.dropped).toBe(
      "the tags no hashtag can be made of (a loose thought) did not go",
    );
  });

  it("takes what the renderer says it left behind and joins the two", () => {
    const lossy: Renderers = {
      [NOTE]: (given) => ({ ...prose(given, at), dropped: ["its artifacts"] }),
    };

    const note = renderNote(
      lossy,
      delivery({ tags: ["quote"] }),
      at,
      options(),
    );

    expect(note.dropped).toBe("its artifacts did not go");
  });

  it("rides out to the delivery as the output's own note", () => {
    expect(markdownOutput("a thought\n", "its tags did not go").note).toBe(
      "its tags did not go",
    );
    expect(markdownOutput("a thought\n").note).toBe(undefined);
  });
});
