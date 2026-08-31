import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { startSweeper } from "./assets/sweeper";
import { cookiesAreSecure, loadConfig } from "./config/load";
import { SHUTDOWN_GRACE_MS } from "./constants";
import { startDeliveryRunner } from "./destinations/runner";
import { startMirrorRunner } from "./mirror/runner";
import { openPool, openAuth } from "./ports";
import { runCliCommand } from "./cli";
import { FORGET_EXPIRED_EVERY_MS } from "./auth/config";
import { createLoginThrottle } from "./auth/throttle";

function start(): void {
  const { values } = parseArgs({
    options: { config: { type: "string" } },
    strict: true,
  });

  const { config, warnings } = loadConfig(values.config);
  for (const key of warnings) {
    console.warn(`notemap: ignoring ${key}, which this daemon does not know`);
  }

  if (!cookiesAreSecure(config.origin)) {
    console.warn(
      `notemap: ${config.origin} is plain HTTP, so a session cookie crosses the network in the clear — put TLS in front of the daemon`,
    );
  }

  mkdirSync(dirname(config.pool), { recursive: true });

  const { pool, ports, mirrorWriter, destinations } = openPool({
    file: config.pool,
    config: config.poolConfig,
    assetRoot: config.assets.root,
    ...(config.mirror === undefined ? {} : { mirrorRoot: config.mirror.root }),
  });

  mkdirSync(dirname(config.auth), { recursive: true });

  const auth = openAuth({
    file: config.auth
  }, {
    clock: ports.clock
  });

  // Nothing waits on this: an expired session or token is refused whether or
  // not it has been swept, so a failed sweep costs a row rather than a refusal.
  const forgetExpired = () => {
    void auth
      .forgetExpired()
      .catch((cause: unknown) =>
        console.error("notemap: could not sweep expired sessions", cause),
      );
  };

  forgetExpired();
  const forgetting = setInterval(forgetExpired, FORGET_EXPIRED_EVERY_MS);
  forgetting.unref();

  const mirror =
    config.mirror === undefined || mirrorWriter === undefined
      ? undefined
      : startMirrorRunner(pool, mirrorWriter, config.mirror);

  // Unconditional: a destination is a row a person may add at any moment, so
  // no startup fact says a delivery job cannot exist.
  const delivery = startDeliveryRunner(pool, destinations, config.delivery);

  const sweeper = startSweeper(pool, config.sweep);

  /** A runner holds a lease while it works; stopping it first gives it back. */
  const close = async () => {
    clearInterval(forgetting);
    await mirror?.stop();
    await delivery.stop();
    await sweeper.stop();
    await pool.close();
    await auth.close();
  };

  const server = serve(
    {
      fetch: createApp(pool, {
        limits: config.assets,
        auth,
        cookies: { secure: cookiesAreSecure(config.origin) },
        throttle: createLoginThrottle({ clock: ports.clock }),
      }).fetch,
      hostname: config.host,
      port: config.port,
    },
    (address) => {
      console.log(
        `notemap: ${config.pool} on http://${config.host}:${address.port}`,
      );
      console.log(
        config.mirror === undefined
          ? "notemap: no mirror configured — the pool is the only copy"
          : `notemap: mirroring to ${config.mirror.root}`,
      );
      console.log(`notemap: assets in ${config.assets.root}`);

      void pool.destinations.list().then((held) => {
        console.log(
          held.length === 0
            ? "notemap: no destinations yet — add one to route anything out"
            : `notemap: destinations ${held.map((each) => each.name).join(", ")}`,
        );
      });

      void auth.requiresCredentials().then((asks) => {
        console.log(
          asks
            ? "notemap: signing in is required to reach /v1"
            : "notemap: no password set — every request is let through; `notemap password set` closes the door",
        );
      });
    },
  );

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `port ${config.port} is already in use; stop what is on it, or set daemon.port`
        : error.message,
    );
    void close().then(() => process.exit(1));
  });

  /**
   * `close()` waits for every connection, and a browser holds an idle
   * keep-alive socket long after it has finished asking for things. Idle
   * sockets go at once; work in flight gets a moment.
   */
  const shutdown = () => {
    const sockets = server as {
      closeIdleConnections?: () => void;
      closeAllConnections?: () => void;
    };

    server.close(() => {
      void close().then(() => process.exit(0));
    });
    sockets.closeIdleConnections?.();
    setTimeout(
      () => sockets.closeAllConnections?.(),
      SHUTDOWN_GRACE_MS,
    ).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const entry = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const first = args[0];

  if (first !== undefined && !first.startsWith("-")) {
    return runCliCommand(args);
  }

  start();
};

entry().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
