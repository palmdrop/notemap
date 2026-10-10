import type { DeliveredAsset, Delivery } from "@notemap/core";
import {
  attachedAssets,
  carriedTags,
  fixedFrontmatter,
} from "@notemap/output-markdown";

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
  /**
   * The asset whose bytes have to be uploaded before the block is made,
   * resolved here rather than looked up when it is: a reference the pool could
   * not resolve has to refuse the delivery before any block is posted, nothing
   * being able to take a posted one back.
   */
  readonly asset?: DeliveredAsset;
};

/** By payload type, exactly as the markdown renderers are wired. */
export type ArenaRenderer = (delivery: Delivery) => readonly ArenaBlock[];

export type ArenaRenderers = Readonly<Record<string, ArenaRenderer>>;

/**
 * A capture with assets is one block per asset **in slot order**, the words
 * captioning the first and no other; a capture with none is its prose. A capture whose
 * prose **begins with a URL** sends the URL as the value and the rest as the
 * caption, so a pasted link arrives as a Link block rather than as a line of
 * text — are.na infers the type from the value, and this is the only place the
 * judgement is made.
 */
export function renderNote(delivery: Delivery): readonly ArenaBlock[] {
  const text = textIn(delivery);
  const assets = attachedAssets(delivery);

  if (assets.length > 0) {
    return assets.map((asset, at) => ({
      value: "",
      ...(text === "" || at > 0 ? {} : { description: text, altText: text }),
      asset,
    }));
  }

  const url = leadingUrl(text);
  if (url === undefined) return [{ value: text }];

  const rest = text.slice(url.length).trim();
  return [{ value: url, ...(rest === "" ? {} : { description: rest }) }];
}

/**
 * The attachments alone: one block per asset and nothing captioned. The words
 * are not dropped on the way here — a delivery that carries the assets alone
 * was asked for without them.
 */
export function renderAssets(delivery: Delivery): readonly ArenaBlock[] {
  return attachedAssets(delivery).map((asset) => ({ value: "", asset }));
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

  const tags = carriedTags(delivery.tags, false);
  for (const [key, value] of fixedFrontmatter(delivery, tags)) {
    if (Object.keys(written).length >= KEY_LIMIT) break;

    const flat = Array.isArray(value) ? value.join(", ") : String(value);
    if (!KEY.test(key) || flat.length > VALUE_LIMIT) continue;
    written[key] = flat;
  }

  return Object.keys(written).length === 0 ? undefined : written;
}

/** What of the capture the delivery was asked to carry, which decides what the note confesses. */
export type Carrying = "everything" | "assets";

/**
 * What a block could not carry as itself, said in the delivery's own note: the
 * tags go into its metadata, where they fit, and artifacts go nowhere. A
 * delivery carrying the assets alone confesses neither its words nor its
 * artifacts — leaving them out is what it was asked for — and still says where
 * the tags went.
 */
export function droppedBy(
  delivery: Delivery,
  carrying: Carrying = "everything",
): string | undefined {
  const said: string[] = [];
  if (delivery.tags.length > 0) said.push("tags are added as metadata");
  if (carrying === "everything" && delivery.artifacts.length > 0) {
    said.push("artifacts are left out");
  }

  return said.length === 0 ? undefined : said.join("; ");
}
