import { fromMarkdown } from "mdast-util-from-markdown";
import type { Paragraph, RootContent } from "mdast";
import type { JsonObject, JsonSchema } from "@notemap/core";

import { RenderingFailed } from "./errors";
import { headingText, isHeading } from "./sections";

export const CONVERSION = "conversion";

export const CONVERSIONS = ["block", "list-item", "task"] as const;

export type Conversion = (typeof CONVERSIONS)[number];

/**
 * Declared before `frontmatter` in every schema that carries it: a form judges
 * a field's condition against the fields before it, and `frontmatter` is
 * offered only while this is `block`.
 */
export const CONVERSION_ARGUMENT: JsonSchema = {
  type: "string",
  enum: [...CONVERSIONS],
  default: "block",
  title: "as",
  description:
    "The shape this delivery is written in: the note as it is, one list item, or one task. A list item or a task carries no frontmatter, and its hashtags go at the end of its first line.",
};

/** Absent is `block`. A value this kind does not publish fails identically on every attempt. */
export function conversionOf(args: JsonObject): Conversion {
  const held = args[CONVERSION];
  if (held === undefined) return "block";
  if (CONVERSIONS.includes(held as Conversion)) return held as Conversion;
  throw new RenderingFailed(`no conversion named ${JSON.stringify(held)}`);
}

const MARKERS: Readonly<Record<Exclude<Conversion, "block">, string>> = {
  "list-item": "- ",
  task: "- [ ] ",
};

/**
 * A rendered body as one list item. The item's own line is the first line of
 * the first prose the body holds, so a capture whose pictures were rendered
 * above its words still reads as its words. Everything else follows, indented
 * as the item's continuation and in the order it was rendered, with the blank
 * lines between blocks taken out: one blank line inside an item makes the
 * whole list it joins loose. A block that would run into the one above it
 * without one keeps it, and a divider is dropped, since under a line of words
 * it would make them a heading. A fenced block keeps its own blank lines,
 * which are its content rather than spacing.
 */
export function asItem(
  body: string,
  conversion: Exclude<Conversion, "block">,
  hashtags: string,
): string {
  const blocks = fromMarkdown(body).children.filter(
    (block) => block.type !== "thematicBreak",
  );
  const lead = leadOf(blocks);

  let said = "";
  const rest: Segment[] = [];
  blocks.forEach((block, at) => {
    const lines = linesOf(body, block);
    const type = isHeading(block) ? "paragraph" : block.type;
    if (at === lead) {
      said = lines[0] ?? "";
      rest.push({ lines: lines.slice(1), type });
    } else {
      rest.push({ lines, type });
    }
  });

  const words = [said, hashtags].filter((part) => part.trim() !== "");
  // GFM reads `[ ]` as a checkbox only with something after it on its line.
  if (conversion === "task" && words.length === 0) {
    throw new RenderingFailed(
      "a task needs words on its own line, and this capture opens with none",
    );
  }

  const first = `${MARKERS[conversion]}${words.join(" ")}`.trimEnd();
  const continued = spaced(said, rest).map((line) =>
    line === "" ? "" : `  ${line}`,
  );

  return `${[first, ...continued].join("\n")}\n`;
}

type Segment = {
  readonly lines: readonly string[];
  readonly type: RootContent["type"];
};

/** The continuation's lines, with a blank line only before a block that would otherwise run into the one above it. */
function spaced(said: string, segments: readonly Segment[]): string[] {
  const lines = said === "" ? [] : [said];
  for (const { lines: own, type } of segments) {
    if (own.length === 0) continue;
    if (lines.length > 0 && runsIn(lines, own, type)) lines.push("");
    lines.push(...own);
  }
  return said === "" ? lines : lines.slice(1);
}

/**
 * Whether `own`, put straight under `above`, stops being the block it was.
 * Prose running on into prose is the one merge a flattened item accepts.
 */
function runsIn(
  above: readonly string[],
  own: readonly string[],
  type: RootContent["type"],
): boolean {
  const before = fromMarkdown(above.join("\n")).children;
  const after = fromMarkdown([...above, ...own].join("\n")).children;
  const last = after.at(-1)?.type;

  if (after.length === before.length + 1 && last === type) return false;
  return !(
    type === "paragraph" &&
    after.length === before.length &&
    last === "paragraph" &&
    before.at(-1)?.type === "paragraph"
  );
}

/** The block whose first line the item says, or none where the body opens with something that is not words. */
function leadOf(blocks: readonly RootContent[]): number {
  const prose = blocks.findIndex(
    (block) =>
      (block.type === "heading" && block.children.length > 0) ||
      (block.type === "paragraph" && !attachmentsOnly(block)),
  );
  if (prose >= 0) return prose;
  return blocks[0]?.type === "paragraph" ? 0 : -1;
}

function attachmentsOnly(paragraph: Paragraph): boolean {
  return paragraph.children.every(
    (child) =>
      child.type === "image" ||
      child.type === "link" ||
      (child.type === "text" && child.value.trim() === ""),
  );
}

/** A heading flattens to its words: inside a list item it would be a heading in the middle of a list. */
function linesOf(source: string, block: RootContent): readonly string[] {
  if (isHeading(block)) return [headingText(source, block)];

  const start = block.position?.start.offset;
  const end = block.position?.end.offset;
  if (start === undefined || end === undefined) return [];

  const lines = source.slice(start, end).split("\n");
  return block.type === "code"
    ? lines
    : lines.filter((line) => line.trim() !== "");
}
