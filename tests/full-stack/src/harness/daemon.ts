import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createClient,
  createFetchTransport,
  createMemoryStore,
  type Client,
} from "@notemap/client";
import { afterEach } from "vitest";

import { world, type World } from "./world.ts";

const MAIN = fileURLToPath(
  new URL("../../../../apps/daemon/dist/main.js", import.meta.url),
);

const READY = /on (http:\/\/\S+)/;
const START_TIMEOUT = 10_000;
const STOP_TIMEOUT = 5_000;

export type Running = {
  readonly url: string;
  readonly world: World;
  /** One client over this daemon, holding what a test has made it read. */
  readonly client: Client;
  /** Answers the code it exited with, so a test can insist on a clean one. */
  readonly stop: () => Promise<number | null>;
  /** Everything the daemon has said, for a test that has to explain itself. */
  readonly output: () => string;
};

/**
 * A daemon per test, and a fresh world unless one is handed over — which is how
 * a restart comes back to the pool the last one left.
 *
 * Call at the top of a test file: it registers the teardown that stops whatever
 * a test started, whether or not the test got as far as stopping it.
 */
export function daemons(): (over?: World) => Promise<Running> {
  const started: Running[] = [];
  const worlds: World[] = [];

  afterEach(async () => {
    for (const running of started.splice(0)) await running.stop();
    for (const each of worlds.splice(0)) each.remove();
  });

  return async (over?: World) => {
    const on = over ?? world();
    if (over === undefined) worlds.push(on);

    const running = await start(on);
    started.push(running);
    return running;
  };
}

async function start(on: World): Promise<Running> {
  const child = spawn("node", [MAIN, "--config", on.config], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let said = "";
  const collect = (chunk: Buffer) => {
    said += chunk.toString();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  /**
   * A daemon that never announced itself is still a daemon holding the port,
   * and nothing has a handle on it yet — so it is stopped here rather than by
   * the teardown that only learns about a start which succeeded.
   */
  const url = await ready(child, on, () => said).catch(async (cause: Error) => {
    await stop(child);
    throw cause;
  });

  return {
    url,
    world: on,
    client: createClient({
      transport: createFetchTransport(url),
      store: createMemoryStore(),
      // What a revision this client's edits produce is captured as.
      source: "full-stack-edit",
    }),
    output: () => said,
    stop: () => stop(child),
  };
}

/**
 * The daemon announces the address it bound, so readiness is read rather than
 * guessed at: a port that refuses a connection cannot say whether the daemon is
 * still starting or died on the way up.
 */
function ready(
  child: ChildProcess,
  on: World,
  said: () => string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = (act: () => void) => {
      clearTimeout(timer);
      child.stdout?.off("data", look);
      child.off("exit", ended);
      act();
    };

    const look = () => {
      const found = READY.exec(said());
      if (found?.[1] !== undefined) done(() => resolve(found[1] as string));
    };

    const ended = (code: number | null) =>
      done(() =>
        reject(
          new Error(
            `the daemon exited with ${code} instead of starting on port ${on.port}. ` +
              `Set NOTEMAP_TEST_PORT in .env if something else is on it.\n${said()}`,
          ),
        ),
      );

    const timer = setTimeout(
      () =>
        done(() => reject(new Error(`the daemon never started:\n${said()}`))),
      START_TIMEOUT,
    );

    child.stdout?.on("data", look);
    child.on("exit", ended);
    look();
  });
}

function stop(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.kill("SIGTERM");
  });
}
