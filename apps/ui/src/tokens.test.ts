import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

const src = join(process.cwd(), "src");

/** The one file allowed to name a value, because it is where the roles are defined. */
const DEFINITIONS = "layout.css";

/**
 * Still wearing the utility soup the port replaces. The list only ever shrinks;
 * when it is empty this file is the whole rule and nothing may be added to it.
 */
const UNPORTED: readonly string[] = [
  "components/capture/CaptureForm.svelte",
  "components/destinations/DestinationForm.svelte",
  "components/destinations/Destinations.svelte",
  "components/feed/Feed.svelte",
  "components/item/Item.svelte",
  "components/outbox/Outbox.svelte",
  "components/queue/EditAction.svelte",
  "components/queue/Queue.svelte",
  "components/queue/QueueItem.svelte",
  "components/queue/RouteAction.svelte",
  "components/queue/Tags.svelte",
  "routes/+layout.svelte",
];

const FORBIDDEN: readonly { what: string; found: RegExp }[] = [
  {
    what: "a hex colour",
    found: /(?<!&)#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  },
  {
    what: "a colour literal",
    found: /\b(?:oklch|oklab|rgba?|hsla?|lch|lab|hwb|color)\(/,
  },
  { what: "a `dark:` variant", found: /\bdark:/ },
  { what: "a font family", found: /font-family\s*:(?![^;]*var\()/ },
  {
    what: "a colour from Tailwind's own palette",
    found:
      /\b(?:text|bg|border|fill|stroke|ring|shadow|accent|caret|decoration|outline|divide|placeholder|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/,
  },
  {
    what: "a raw value where a role belongs",
    found:
      /\b(?:text|bg|border|fill|stroke|ring|shadow|accent|caret|decoration|outline|divide|placeholder|from|via|to)-\[(?!var\()/,
  },
];

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const here = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(here);
    return entry.name === DEFINITIONS ? [] : [here];
  });
}

const shell = [
  ...filesUnder(join(src, "components")),
  ...filesUnder(join(src, "routes")),
].map((file) => file.slice(src.length + 1));

const ported = shell.filter((file) => !UNPORTED.includes(file));

test("the shell has files to check at all", () => {
  expect(ported.length).toBeGreaterThan(20);
});

test("nothing on the unported list has quietly gone away", () => {
  expect(UNPORTED.filter((file) => !shell.includes(file))).toEqual([]);
});

test.each(FORBIDDEN)("no file in the shell names $what", ({ found }) => {
  const named = ported.filter((file) =>
    found.test(readFileSync(join(src, file), "utf8")),
  );
  expect(named).toEqual([]);
});
