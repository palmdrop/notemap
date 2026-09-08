import type { Delivery } from "@notemap/core";
import { fixedFrontmatter } from "@notemap/output-markdown";

/**
 * What a delivery becomes on a board. Not markdown, and not
 * `@notemap/output-markdown`'s `Renderer`: a block has a value, a caption and
 * nothing else, and forcing it through a note's shape would mean converting
 * twice.
 */
export type ArenaBlock = {
  /** A URL, from which are.na infers Link, Image or Embed; or the text itself. */
  readonly value: string;
  /** The caption, in markdown. */
  readonly description?: string;
  /** Where the value is an image, what it shows. */
  readonly altText?: string;
  /** The asset whose bytes have to be uploaded before the block is made. */
  readonly asset?: { readonly slot: string };
};

/** By payload type, exactly as the markdown renderers are wired. */
export type ArenaRenderer = (delivery: Delivery) => ArenaBlock;

export type ArenaRenderers = Readonly<Record<string, ArenaRenderer>>;

/**
 * A capture with one asset is that asset, captioned; a capture with none is its
 * prose. A capture whose prose **begins with a URL** sends the URL as the value
 * and the rest as the caption, so a pasted link arrives as a Link block rather
 * than as a line of text — are.na infers the type from the value, and this is
 * the only place the judgement is made.
 */
export function renderNote(delivery: Delivery): ArenaBlock {
  const text = textIn(delivery);
  const asset = delivery.payload.assets[0];

  if (asset !== undefined) {
    return {
      value: "",
      ...(text === "" ? {} : { description: text, altText: text }),
      asset: { slot: asset.slot },
    };
  }

  const url = leadingUrl(text);
  if (url === undefined) return { value: text };

  const rest = text.slice(url.length).trim();
  return { value: url, ...(rest === "" ? {} : { description: rest }) };
}

export function arenaRenderers(): ArenaRenderers {
  return { note: renderNote };
}

function textIn(delivery: Delivery): string {
  const text = delivery.payload.content["text"];
  return typeof text === "string" ? text.trim() : "";
}

/**
 * The whole of the first line, where that line is one URL and nothing else. A
 * URL with prose after it on the same line is prose: splitting there would send
 * are.na half a sentence and keep the other half as a caption.
 */
function leadingUrl(text: string): string | undefined {
  const [first = ""] = text.split("\n");
  const candidate = first.trim();
  if (candidate === "" || /\s/.test(candidate)) return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }

  return url.protocol === "http:" || url.protocol === "https:"
    ? candidate
    : undefined;
}

/** Keys are alphanumeric or underscore, at most 40 characters. */
const KEY = /^[A-Za-z0-9_]{1,40}$/;
const VALUE_LIMIT = 2000;
const KEY_LIMIT = 50;

/**
 * Where the block came from, on the **block** rather than on the connection, so
 * it survives the block being moved out of the channel it landed in. Best
 * effort and never a dedup mechanism: are.na does not make it queryable, and
 * nothing here reads it back.
 *
 * The vocabulary is the one a note's frontmatter carries, taken from it rather
 * than spelt again: one item routed to a vault and to a channel says where it
 * came from in one set of words. What are.na will not take is dropped — a list
 * becomes one joined string, since a capture may carry more tags than the whole
 * object is allowed keys.
 */
export function provenanceOf(
  delivery: Delivery,
): Record<string, string> | undefined {
  const written: Record<string, string> = {};

  for (const [key, value] of fixedFrontmatter(delivery)) {
    if (Object.keys(written).length >= KEY_LIMIT) break;

    const flat = Array.isArray(value) ? value.join(", ") : String(value);
    if (!KEY.test(key) || flat.length > VALUE_LIMIT) continue;
    written[key] = flat;
  }

  return Object.keys(written).length === 0 ? undefined : written;
}

/** What was dropped on the way, said in the delivery's own note. */
export function droppedBy(delivery: Delivery): string | undefined {
  const dropped: string[] = [];
  if (delivery.tags.length > 0) dropped.push("its tags");
  if (delivery.artifacts.length > 0) dropped.push("its artifacts");

  return dropped.length === 0
    ? undefined
    : `a block carries neither ${dropped.join(" nor ")}; what fitted went into the block's own metadata`;
}
