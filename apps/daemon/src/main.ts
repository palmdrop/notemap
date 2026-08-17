import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { startSweeper } from "./assets/sweeper";
import { loadConfig } from "./config/load";
import { SHUTDOWN_GRACE_MS } from "./constants";
import { startDeliveryRunner } from "./destinations/runner";
import { startMirrorRunner } from "./mirror/runner";
import { openPool } from "./ports";

function start(): void {
  const { values } = parseArgs({
    options: { config: { type: "string" } },
    strict: true,
  });

  const config = loadConfig(values.config);
  mkdirSync(dirname(config.pool), { recursive: true });

  const { pool, mirrorWriter, destinations } = openPool({
    file: config.pool,
    config: config.poolConfig,
    assetRoot: config.assets.root,
    ...(config.mirror === undefined ? {} : { mirrorRoot: config.mirror.root }),
    destinations: config.destinations,
  });

  const mirror =
    config.mirror === undefined || mirrorWriter === undefined
      ? undefined
      : startMirrorRunner(pool, mirrorWriter, config.mirror);

  // No destinations means no delivery job can ever exist, so there is nothing
  // for a runner to claim.
  const delivery =
    destinations.length === 0
      ? undefined
      : startDeliveryRunner(pool, destinations, config.delivery);

  const sweeper = startSweeper(pool, config.sweep);

  /** A runner holds a lease while it works; stopping it first gives it back. */
  const close = async () => {
    await mirror?.stop();
    await delivery?.stop();
    await sweeper.stop();
    await pool.close();
  };

  const server = serve(
    {
      fetch: createApp(pool, config.assets).fetch,
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
      console.log(
        config.destinations.length === 0
          ? "notemap: no destinations configured — nothing can be routed out"
          : `notemap: destinations ${config.destinations.map((each) => each.id).join(", ")}`,
      );
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

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
