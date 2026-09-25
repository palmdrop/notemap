import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

const src = join(process.cwd(), "src");

/** The one file allowed to name a value, because it is where the roles are defined. */
const DEFINITIONS = join("styles", "tokens.css");

/** Empty, and it stays empty: nothing may be added to it. */
const UNPORTED: readonly string[] = [];

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
  {
    what: "a duration, delay or easing of its own",
    found:
      /\b(?:duration|delay)-(?:\d|\[)|\b(?:ease|animate)-(?:in|out|linear|spin|ping|pulse|bounce|\[)|\b(?:duration|delay):\s*\d|(?:transition|animation)(?:-duration|-delay|-timing-function)?\s*:(?![^;]*var\()[^;{]*\d/,
  },
  // Roles the shell used to have. One face at one size, and no muted ink,
  // no green and no accent — each of these is a name for something retired.
  ...[
    "font-mono",
    "font-prose",
    "text-mono",
    "text-prose",
    "text-ink-muted",
    "text-good",
    "text-accent",
    "text-paper",
    "bg-paper",
  ].map((name) => ({
    what: `the retired class \`${name}\``,
    found: new RegExp(`(?<![\\w-])${name}(?![\\w-])`),
  })),
];

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const here = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(here) : [here];
  });
}

const shell = [
  ...filesUnder(join(src, "components")),
  ...filesUnder(join(src, "routes")),
  ...filesUnder(join(src, "styles")),
]
  .map((file) => file.slice(src.length + 1))
  .filter((file) => file !== DEFINITIONS);

const ported = shell.filter((file) => !UNPORTED.includes(file));

test("the shell has files to check at all", () => {
  expect(ported.length).toBeGreaterThan(20);
});

// The global stylesheets sit outside the component tree, so nothing else would
// notice if this gate stopped reaching them.
test("the gate reaches the global styles, and exempts only the roles", () => {
  expect(ported.filter((file) => file.startsWith("styles"))).not.toEqual([]);
  expect(ported).not.toContain(DEFINITIONS);
  expect(existsSync(join(src, DEFINITIONS))).toBe(true);
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
