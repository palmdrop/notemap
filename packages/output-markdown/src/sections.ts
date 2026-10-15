import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, List, Root, RootContent } from "mdast";

/** The level a heading this package has to write itself gets. */
const OWN_LEVEL = "##";

/** The note as it is to be written, and the fragment as it went into it. */
export type Inserted = { readonly file: string; readonly inserted: string };

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
): Inserted {
  if (existing.trim() === "") {
    const added = trimmed(fragment);
    return {
      file: join(heading === undefined ? [added] : [head(heading), added]),
      inserted: fragment,
    };
  }

  const tree = fromMarkdown(existing);
  const at =
    heading === undefined
      ? undefined
      : tree.children.findIndex(
          (node) => isHeading(node) && headingText(existing, node) === heading,
        );
  if (heading !== undefined && at === -1) {
    return {
      file: join([trimmed(existing), head(heading), trimmed(fragment)]),
      inserted: fragment,
    };
  }

  const ends = at === undefined ? tree.children.length : endOfSection(tree, at);
  const { inserted, gap } = joining(
    existing,
    tree.children[ends - 1],
    fragment,
  );
  const added = trimmed(inserted);

  const offset = tree.children[ends]?.position?.start.offset;
  const file =
    offset === undefined
      ? `${trimmed(existing)}${gap}${added}\n`
      : `${trimmed(existing.slice(0, offset))}${gap}${join([
          added,
          trimmed(existing.slice(offset)),
        ])}`;

  return { file, inserted };
}

/**
 * A fragment opening with a list, landing straight after a list of the same
 * sort, joins it: one newline rather than the blank line that would loosen a
 * tight list, and a bullet list's own marker, without which the fragment
 * would start a list of its own.
 */
function joining(
  existing: string,
  last: RootContent | undefined,
  fragment: string,
): { inserted: string; gap: string } {
  const opens = fromMarkdown(fragment).children[0];
  if (!isList(opens) || !isList(last) || opens.ordered !== last.ordered) {
    return { inserted: fragment, gap: "\n\n" };
  }

  const marker = last.ordered === true ? undefined : bulletAt(existing, last);
  return {
    inserted:
      marker === undefined ? fragment : rebulleted(fragment, opens, marker),
    gap: last.spread === true ? "\n\n" : "\n",
  };
}

const BULLET = /^[ \t]*([-*+])/;

function bulletAt(source: string, list: List): string | undefined {
  const offset = list.position?.start.offset;
  return offset === undefined
    ? undefined
    : BULLET.exec(source.slice(offset))?.[1];
}

/** Each of the list's own items written with `marker`, leaving nested lists as they are. */
function rebulleted(fragment: string, list: List, marker: string): string {
  let written = fragment;
  for (const item of list.children) {
    const offset = item.position?.start.offset;
    const found =
      offset === undefined ? null : BULLET.exec(written.slice(offset));
    if (offset === undefined || found === null) continue;

    const at = offset + found[0].length - 1;
    written = `${written.slice(0, at)}${marker}${written.slice(at + 1)}`;
  }
  return written;
}

/**
 * Where the section opened at `at` stops, as the index of the first block that
 * is not in it — the next heading no deeper than its own, or the end of the
 * note.
 *
 * A `#` inside a fenced code block is not one of those, which is the whole
 * reason this reads a parse rather than the lines: `# install deps` in a shell
 * block used to end the section, and the fragment landed inside the fence.
 */
function endOfSection(tree: Root, at: number): number {
  const opened = tree.children[at];
  if (opened === undefined || !isHeading(opened)) return tree.children.length;

  const next = tree.children.findIndex(
    (node, index) =>
      index > at && isHeading(node) && node.depth <= opened.depth,
  );
  return next < 0 ? tree.children.length : next;
}

function isList(node: RootContent | undefined): node is List {
  return node?.type === "list";
}

export function isHeading(node: RootContent): node is Heading {
  return node.type === "heading";
}

/**
 * The heading's own text, taken from the source rather than from its children,
 * so `## Read: *Borges*` matches what a person typed into the form instead of
 * what its emphasis parsed to.
 */
export function headingText(source: string, heading: Heading): string {
  const start = heading.position?.start.offset;
  const end = heading.position?.end.offset;
  if (start === undefined || end === undefined) return "";

  return (
    source
      .slice(start, end)
      // The underline of a setext heading, which is part of the heading and not
      // part of what it says.
      .replace(/\n[=-]+[ \t]*$/, "")
      // `\s*`, not `\s+`: a heading that is nothing but its hashes says
      // nothing, and a browse offers what a note says.
      .replace(/^#{1,6}\s*/, "")
      .replace(/\s+#*\s*$/, "")
      .trim()
  );
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
