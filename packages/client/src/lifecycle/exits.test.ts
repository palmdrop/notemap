import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

let bundle = "";
let directory = "";

/**
 * The fixture is bundled and run by `node` itself, not inside the test runner:
 * a leaked handle is invisible to a process that is holding the loop open
 * anyway, and only the fixture's own exit says whether the client let go.
 */
beforeAll(async () => {
  bundle = await mkdtemp(join(tmpdir(), "notemap-bundle-"));
  await build({
    entryPoints: [join(here, "a-process-that-captures.ts")],
    outfile: join(bundle, "captures.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
});

afterAll(() => rm(bundle, { recursive: true, force: true }));

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "notemap-exits-"));
});

afterEach(() => rm(directory, { recursive: true, force: true }));

/** The exit code, or nothing where the process was still alive after `patience`. */
function ran(
  patience: number,
  ...args: string[]
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(bundle, "captures.mjs"), directory, ...args],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const giveUp = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, stderr });
    }, patience);
    child.on("exit", (code) => {
      clearTimeout(giveUp);
      resolve({ code, stderr });
    });
  });
}

describe("a process that captures through a client", () => {
  it("ends on its own once the client is closed, with the capture in the outbox", async () => {
    const { code, stderr } = await ran(10_000);

    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(await readdir(join(directory, "outbox"))).toHaveLength(1);
  });

  it("ends although it closed on a drain that never got an answer", async () => {
    const { code, stderr } = await ran(10_000, "stalling");

    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(await readdir(join(directory, "outbox"))).toHaveLength(1);
    // Past the patience above, so a process that never ends is reported as
    // that rather than as the runner giving up on the test.
  }, 15_000);

  it("is held open by a client left open", async () => {
    const { code } = await ran(1_500, "open");

    expect(code).toBeNull();
  });
});
