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
 * whole list it joins loose. A fenced block keeps its own blank lines, which
 * are its content rather than spacing.
 */
export function asItem(
  body: string,
  conversion: Exclude<Conversion, "block">,
  hashtags: string,
): string {
  const blocks = fromMarkdown(body).children;
  const lead = leadOf(blocks);

  let said = "";
  const rest: string[] = [];
  blocks.forEach((block, at) => {
    const lines = linesOf(body, block);
    if (at === lead) {
      said = lines[0] ?? "";
      rest.push(...lines.slice(1));
    } else {
      rest.push(...lines);
    }
  });

  const words = [said, hashtags].filter((part) => part.trim() !== "");
  const first = `${MARKERS[conversion]}${words.join(" ")}`.trimEnd();
  const continued = rest.map((line) => (line === "" ? "" : `  ${line}`));

  return `${[first, ...continued].join("\n")}\n`;
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
