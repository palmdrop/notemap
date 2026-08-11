import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The other tests import from `src`, which leaves nobody running what the build
 * actually emits. A dependency that survives bundling but not the bundle — a
 * CommonJS one calling `require` at load, say — passes every one of them and
 * still dies on the first line of `node dist/main.js`.
 */
const APP = fileURLToPath(new URL("..", import.meta.url));

const directories: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

function configured(port: number): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-bundle-"));
  directories.push(directory);

  const path = join(directory, "config.toml");
  writeFileSync(
    path,
    [
      "[daemon]",
      `pool = "${join(directory, "pool.db")}"`,
      `port = ${port}`,
      "",
      "[mirror]",
      `root = "${join(directory, "pool-mirror")}"`,
      "",
    ].join("\n"),
  );

  return path;
}

/** Rejects with whatever the daemon said, which is the whole point of it. */
function listening(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    let said = "";
    const watch = (chunk: Buffer) => {
      said += chunk.toString();
      if (said.includes("on http://")) resolve();
    };

    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (code) =>
      reject(new Error(`the daemon exited with ${code}: ${said}`)),
    );
  });
}

function stopped(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? -1));
    child.kill("SIGTERM");
  });
}

afterAll(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) await stopped(child);
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("what the build emits", () => {
  it("serves over a real listener", async () => {
    execFileSync(process.execPath, ["scripts/build.ts"], { cwd: APP });

    const port = await freePort();
    const child = spawn(
      process.execPath,
      ["dist/main.js", "--config", configured(port)],
      { cwd: APP },
    );
    children.push(child);

    await listening(child);

    expect((await fetch(`http://127.0.0.1:${port}/v1/feed`)).status).toBe(200);
    expect(await stopped(child)).toBe(0);
  }, 60_000);
});
