import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadConfig } from "./config/load";
import { SHUTDOWN_GRACE_MS } from "./constants";
import { openPool } from "./ports";

function start(): void {
  const { values } = parseArgs({
    options: { config: { type: "string" } },
    strict: true,
  });

  const config = loadConfig(values.config);
  mkdirSync(dirname(config.pool), { recursive: true });

  const pool = openPool(config.pool, config.poolConfig);
  const server = serve(
    { fetch: createApp(pool).fetch, hostname: config.host, port: config.port },
    (address) =>
      console.log(
        `notemap: ${config.pool} on http://${config.host}:${address.port}`,
      ),
  );

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `port ${config.port} is already in use; stop what is on it, or set daemon.port`
        : error.message,
    );
    void pool.close().then(() => process.exit(1));
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
      void pool.close().then(() => process.exit(0));
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
