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
  return { frontmatter: "none", tags: "frontmatter", ...overrides };
}

const at = { directory: "", assets: new Map<string, string>() };

describe("where a note carries its tags", () => {
  it("puts them among the frontmatter, which is where they went before", () => {
    const note = renderNote(renderers, delivery({ tags: ["quote"] }), at, {
      frontmatter: "full",
      tags: "frontmatter",
    });

    expect(note.frontmatter).toContain("tags:\n  - 'quote'");
    expect(note.body).toBe("a thought\n");
  });

  it("writes them at the foot of the note as hashtags, one blank line down", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote", "project/fiction-a"] }),
      at,
      options({ tags: "hashtags" }),
    );

    expect(note.body).toBe("a thought\n\n#quote #project/fiction-a\n");
  });

  /** Both places would be one tag said twice, and the block is the one being turned off. */
  it("takes them out of the frontmatter where the body is carrying them", () => {
    const note = renderNote(renderers, delivery({ tags: ["quote"] }), at, {
      frontmatter: "full",
      tags: "hashtags",
    });

    expect(note.frontmatter).not.toContain("tags:");
    expect(note.body).toBe("a thought\n\n#quote\n");
  });

  it("carries them nowhere where it was asked to carry them nowhere", () => {
    const note = renderNote(renderers, delivery({ tags: ["quote"] }), at, {
      frontmatter: "full",
      tags: "none",
    });

    expect(note.frontmatter).not.toContain("tags:");
    expect(note.body).toBe("a thought\n");
  });
});

describe("what a note says it could not carry", () => {
  it("says nothing where there was nothing to leave behind", () => {
    expect(renderNote(renderers, delivery(), at, options()).dropped).toBe(
      undefined,
    );
  });

  /** The default pairing, and the one that used to lose tags in silence. */
  it("confesses tags bound for a frontmatter block nobody is writing", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote"] }),
      at,
      options(),
    );

    expect(note.dropped).toBe("its tags did not go");
  });

  it("names the tags no hashtag could be made of", () => {
    const note = renderNote(
      renderers,
      delivery({ tags: ["quote", "a loose thought"] }),
      at,
      options({ tags: "hashtags" }),
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

    expect(note.dropped).toBe("its tags and its artifacts did not go");
  });

  it("rides out to the delivery as the output's own note", () => {
    expect(markdownOutput("a thought\n", "its tags did not go").note).toBe(
      "its tags did not go",
    );
    expect(markdownOutput("a thought\n").note).toBe(undefined);
  });
});
