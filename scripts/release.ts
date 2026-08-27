import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BUMPS = ["patch", "minor", "major"] as const;
type Bump = (typeof BUMPS)[number];

const MANIFEST = fileURLToPath(new URL("../package.json", import.meta.url));

const BRANCH = "main";

/** Everything a release has to pass. `test:stack` is in: a release crosses every layer. */
const CHECKS: readonly (readonly string[])[] = [
  ["typecheck"],
  ["lint"],
  ["format:check"],
  ["-r", "--silent", "test"],
  ["test:stack"],
];

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, [...args], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(
      `\`${command} ${args.join(" ")}\` failed\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function loud(command: string, args: readonly string[]): void {
  const result = spawnSync(command, [...args], { stdio: "inherit" });
  if (result.status !== 0) fail(`\`${command} ${args.join(" ")}\` failed`);
}

function version(): string {
  const parsed: unknown = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const held = (parsed as { version?: unknown }).version;
  if (typeof held !== "string") fail("package.json has no version");
  return held;
}

function bumpFrom(argv: readonly string[]): Bump {
  const named = argv.filter((arg) => arg !== "--");
  const bump = named[0];

  if (named.length !== 1 || !BUMPS.includes(bump as Bump)) {
    fail(`usage: pnpm release ${BUMPS.join("|")}`);
  }
  return bump as Bump;
}

/**
 * A release has to be reproducible from what is on the remote, so every one of
 * these is about the tag naming a commit anybody else can also get to.
 */
function guard(): void {
  if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== BRANCH) {
    fail(`releases are cut from ${BRANCH}`);
  }

  if (run("git", ["status", "--porcelain"]) !== "") {
    fail("the working tree has changes; commit or stash them first");
  }

  run("git", ["fetch", "origin", BRANCH]);

  const behind = run("git", ["rev-list", "--count", `HEAD..origin/${BRANCH}`]);
  if (behind !== "0") {
    fail(`${BRANCH} is ${behind} commits behind origin; pull first`);
  }
}

/** Why `tag` cannot be cut, or nothing. Answered rather than refused: by the time
 * anyone can ask, the bump is already written and has to be put back first. */
function tagConflict(tag: string): string | undefined {
  const local = spawnSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`]);
  if (local.status === 0) return `${tag} already exists`;

  return run("git", ["ls-remote", "--tags", "origin", tag]) === ""
    ? undefined
    : `${tag} already exists on origin`;
}

/**
 * Undo the bump, then report. The clean-tree guard ran before anything was
 * written, so discarding the manifest can only discard what this script did.
 */
function abandon(message: string): never {
  run("git", ["checkout", "--", MANIFEST]);
  fail(message);
}

const bump = bumpFrom(process.argv.slice(2));
const before = version();

guard();

for (const check of CHECKS) {
  console.log(`release: pnpm ${check.join(" ")}`);
  loud("pnpm", check);
}

// After the checks, so a failing one costs nothing that has to be undone.
loud("pnpm", ["version", bump, "--no-git-tag-version"]);

const after = version();
const tag = `v${after}`;

const conflict = tagConflict(tag);
if (conflict !== undefined) abandon(conflict);

run("git", ["add", MANIFEST]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", tag]);

console.log(`release: notemap ${before} -> ${after}`);

run("git", ["push", "origin", BRANCH]);
run("git", ["push", "origin", tag]);

console.log(`release: pushed ${tag}`);
console.log(`release: CI is building ghcr.io/palmdrop/notemap:${tag}`);
