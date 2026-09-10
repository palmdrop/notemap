import type { Delivery, DeliveredOutput } from "@notemap/core";

import { FIXED_KEYS, fixedFrontmatter, TAGS_KEY, toYaml } from "./frontmatter";
import type { FrontmatterMode, FrontmatterValue } from "./frontmatter";
import {
  renderAsJson,
  type Renderers,
  type Rendering,
  type RenderingContext,
} from "./renderers";
import { hashtagsFor, type Hashtags, type TagsMode } from "./tags";

/** What a renderer did rather than what a destination did, which is never worth retrying. */
export class RenderingFailed extends Error {}

export type Note = {
  /** The YAML block, ending in a newline. Empty where none was asked for. */
  readonly frontmatter: string;
  /** CommonMark, and on its own what an append carries. */
  readonly body: string;
  /**
   * What this note left behind, as the prose a delivery confesses it in. A note
   * that carried everything has none, which is what the absence means.
   */
  readonly dropped?: string;
};

/** What a note is asked to carry beyond the item's own prose. */
export type NoteOptions = {
  readonly frontmatter: FrontmatterMode;
  readonly tags: TagsMode;
};

/** What every note either kind writes is, and what a delivery says its output was. */
export const MARKDOWN = "text/markdown";

/** The rendering that landed, and what it could not carry where it carried less than everything. */
export function markdownOutput(
  text: string,
  dropped?: string,
): DeliveredOutput {
  const written = new TextEncoder().encode(text);
  return {
    content: {
      mediaType: MARKDOWN,
      open: () => Promise.resolve(once(written)),
    },
    ...(dropped === undefined ? {} : { note: dropped }),
  };
}

async function* once(written: Uint8Array): AsyncGenerator<Uint8Array> {
  yield written;
}

/**
 * One delivery as a note, wherever the note is going. A renderer may add
 * frontmatter of its own and may not shadow a fixed key, which is what keeps a
 * destination's dialect from rewriting the provenance a note is traced by.
 *
 * `none` drops the block whole, the renderer's own keys with it: what is off is
 * the frontmatter rather than notemap's half of it.
 */
export function renderNote(
  renderers: Renderers,
  delivery: Delivery,
  at: RenderingContext,
  options: NoteOptions,
): Note {
  const rendered = renderOrRefuse(renderers, delivery, at);
  const hashtags =
    options.tags === "hashtags"
      ? hashtagsFor(delivery.tags.map((tag) => tag.name))
      : undefined;

  const body =
    hashtags === undefined || hashtags.line === ""
      ? rendered.body
      : below(rendered.body, hashtags.line);
  const dropped = confession(delivery, options, rendered, hashtags);
  const said = dropped === undefined ? {} : { dropped };

  if (options.frontmatter === "none") {
    return { frontmatter: "", body, ...said };
  }

  const entries = new Map<string, FrontmatterValue>(fixedFrontmatter(delivery));
  if (options.tags !== "frontmatter") entries.delete(TAGS_KEY);
  for (const [key, value] of rendered.frontmatter ?? []) {
    if (!FIXED_KEYS.includes(key)) entries.set(key, value);
  }

  return { frontmatter: toYaml(entries), body, ...said };
}

/** One blank line between what the item said and the tags, whatever the body ended with. */
function below(body: string, line: string): string {
  const said = body.replace(/\n+$/, "");
  return said === "" ? `${line}\n` : `${said}\n\n${line}\n`;
}

/**
 * What a person is owed a sentence about: this note's own losses, and whatever
 * the renderer says it left behind. Assembled here because nowhere else knows
 * both — the renderer never hears where tags were asked to go, and the adapter
 * never sees what the renderer decided.
 */
function confession(
  delivery: Delivery,
  options: NoteOptions,
  rendered: Rendering,
  hashtags: Hashtags | undefined,
): string | undefined {
  const lost: string[] = [];

  if (delivery.tags.length > 0 && nowhere(options)) lost.push("its tags");
  if (hashtags !== undefined && hashtags.unwritable.length > 0) {
    lost.push(
      `the tags no hashtag can be made of (${hashtags.unwritable.join(", ")})`,
    );
  }
  lost.push(...(rendered.dropped ?? []));

  return lost.length === 0 ? undefined : `${lost.join(" and ")} did not go`;
}

/** Tags off outright, or in a frontmatter block this note is not writing. */
function nowhere(options: NoteOptions): boolean {
  return (
    options.tags === "none" ||
    (options.tags === "frontmatter" && options.frontmatter === "none")
  );
}

/** A whole file: the block, a blank line, then the prose — or the prose alone. */
export function fileOf(frontmatter: string, body: string): string {
  return frontmatter === "" ? body : `${frontmatter}\n${body}`;
}

function renderOrRefuse(
  renderers: Renderers,
  delivery: Delivery,
  at: RenderingContext,
): Rendering {
  const renderer = renderers[delivery.payload.type] ?? renderAsJson;
  try {
    return renderer(delivery, at);
  } catch (cause) {
    // It will throw identically on every attempt, so retrying is pointless.
    throw new RenderingFailed(
      `the renderer for ${delivery.payload.type} threw: ${why(cause)}`,
    );
  }
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
