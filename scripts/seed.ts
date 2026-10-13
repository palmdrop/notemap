import { readFileSync } from "node:fs";

import { readFixture, seed } from "@notemap/seed";

const args = process.argv.slice(2).filter((arg) => arg !== "--");

/** The value after a flag, `undefined` where the flag is absent, and a refusal where it has none. */
function flag(name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;

  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`notemap: ${name} takes a value`);
    process.exit(1);
  }
  return value;
}

/** A file written by `echo` or mounted as a secret ends in a newline, which no password does. */
const unterminated = (contents: string) => contents.replace(/\r?\n$/, "");

const url = flag("--url") ?? "http://127.0.0.1:4747";
const passwordFile = flag("--password-file");
const fixtures = flag("--fixtures");

const password =
  passwordFile === undefined
    ? process.env["NOTEMAP_PASSWORD"]
    : unterminated(readFileSync(passwordFile, "utf8"));

const seeded = await seed(url, {
  ...(password === undefined ? {} : { password }),
  ...(fixtures === undefined
    ? {}
    : { fixture: readFixture(JSON.parse(readFileSync(fixtures, "utf8"))) }),
});

console.log(`notemap: seeded ${url}`);
console.log(`  queued     ${seeded.queued.join(", ")}`);
console.log(`  processed  ${seeded.processed.join(", ")}`);
console.log(`  archived   ${seeded.archived.join(", ")}`);
console.log(`  with image ${seeded.withImage.item}`);
console.log(
  seeded.routed.length === 0
    ? "  routed     nothing — this pool holds no destination that can be described. Make one in the shell's settings, or over POST /v1/destinations, and seed again"
    : `  routed     ${seeded.routed.map((each) => `${each.item} to ${each.destination}`).join(", ")}`,
);
