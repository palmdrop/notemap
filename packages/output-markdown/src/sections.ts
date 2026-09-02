import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, Root, RootContent } from "mdast";

/** The level a heading this package has to write itself gets. */
const OWN_LEVEL = "##";

/**
 * A heading that is not there is written rather than refused: sections of a
 * daily note appear as things are filed into them.
 *
 * The note is parsed but never re-rendered. What comes back is one offset, and
 * the fragment is spliced into the original string at it — writing the tree
 * back would reformat somebody's note around an insertion they asked for at the
 * end of it.
 */
export function insertUnder(
  existing: string,
  fragment: string,
  heading?: string,
): string {
  const added = trimmed(fragment);

  if (existing.trim() === "") {
    return join(heading === undefined ? [added] : [head(heading), added]);
  }
  if (heading === undefined) return join([trimmed(existing), added]);

  const tree = fromMarkdown(existing);
  const at = tree.children.findIndex(
    (node) => isHeading(node) && textOf(existing, node) === heading,
  );
  if (at < 0) return join([trimmed(existing), head(heading), added]);

  const end = endOfSection(tree, at);
  return end === undefined
    ? join([trimmed(existing), added])
    : join([
        trimmed(existing.slice(0, end)),
        added,
        trimmed(existing.slice(end)),
      ]);
}

/**
 * Where the section opened at `at` stops carrying content, as an offset into
 * the source — the start of the next heading no deeper than its own, or absent
 * where the section runs to the end of the note.
 *
 * A `#` inside a fenced code block is not one of those, which is the whole
 * reason this reads a parse rather than the lines: `# install deps` in a shell
 * block used to end the section, and the fragment landed inside the fence.
 */
function endOfSection(tree: Root, at: number): number | undefined {
  const opened = tree.children[at];
  if (opened === undefined || !isHeading(opened)) return undefined;

  for (const node of tree.children.slice(at + 1)) {
    if (isHeading(node) && node.depth <= opened.depth) {
      return node.position?.start.offset;
    }
  }

  return undefined;
}

function isHeading(node: RootContent): node is Heading {
  return node.type === "heading";
}

/**
 * The heading's own text, taken from the source rather than from its children,
 * so `## Read: *Borges*` matches what a person typed into the form instead of
 * what its emphasis parsed to.
 */
function textOf(source: string, heading: Heading): string {
  const start = heading.position?.start.offset;
  const end = heading.position?.end.offset;
  if (start === undefined || end === undefined) return "";

  return source
    .slice(start, end)
    // The underline of a setext heading, which is part of the heading and not
    // part of what it says.
    .replace(/\n[=-]+[ \t]*$/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+#*\s*$/, "")
    .trim();
}

function head(heading: string): string {
  return `${OWN_LEVEL} ${heading}`;
}

/** No trailing blank lines: one blank line between blocks is this file's join. */
function trimmed(text: string): string {
  return text.replace(/\n+$/, "");
}

function join(blocks: readonly string[]): string {
  return `${blocks.filter((block) => block !== "").join("\n\n")}\n`;
}
