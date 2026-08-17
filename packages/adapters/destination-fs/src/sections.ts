const HEADING = /^(#{1,6})\s+(.*?)\s*$/;

/** The level a heading this adapter has to write itself gets. */
const OWN_LEVEL = "##";

/**
 * `fragment` placed into `existing`, at the end of the named heading's section
 * or at the end of the file.
 *
 * A heading that is not there is written rather than refused: the motivating
 * case is a daily note whose sections appear as things are filed into them, and
 * a delivery that failed because a person had not typed a heading yet would be
 * a chore rather than a safeguard.
 */
export function insertUnder(
  existing: string,
  fragment: string,
  heading?: string,
): string {
  const added = lines(fragment);

  if (existing.trim() === "") {
    return join(heading === undefined ? added : [head(heading), "", ...added]);
  }

  const before = lines(existing);
  if (heading === undefined) return join([...before, "", ...added]);

  const at = before.findIndex((line) => headingText(line) === heading);
  if (at < 0) return join([...before, "", head(heading), "", ...added]);

  const end = sectionEnd(before, at);
  return join([...before.slice(0, end), "", ...added, ...before.slice(end)]);
}

/** Where the section opened at `at` stops carrying content. */
function sectionEnd(before: readonly string[], at: number): number {
  const level = (HEADING.exec(before[at] ?? "")?.[1] ?? "#").length;

  let end = before.length;
  for (let index = at + 1; index < before.length; index += 1) {
    const next = HEADING.exec(before[index] ?? "");
    if (next !== null && next[1] !== undefined && next[1].length <= level) {
      end = index;
      break;
    }
  }

  while (end > at + 1 && (before[end - 1] ?? "").trim() === "") end -= 1;
  return end;
}

function headingText(line: string): string | undefined {
  return HEADING.exec(line)?.[2];
}

function head(heading: string): string {
  return `${OWN_LEVEL} ${heading}`;
}

function lines(text: string): string[] {
  return text.replace(/\n+$/, "").split("\n");
}

function join(all: readonly string[]): string {
  return `${all.join("\n")}\n`;
}
