import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";

import type { PoolConfig } from "@notemap/core";

import { createApp, OPENAPI_INFO } from "./app";
import { loadConfig } from "./config";
import { OPENAPI_FILE } from "./openapi-file";
import { openPool } from "./ports";

/** Localhost only. There is no authentication; the pool is the boundary. */
const BIND = "127.0.0.1";

const EMPTY_POOL: PoolConfig = {
  sources: [],
  payloadTypes: [],
  enrichments: [],
  retry: {
    maxAttempts: 1,
    initialBackoff: 0,
    maxBackoff: 0,
  } as PoolConfig["retry"],
};

/**
 * Written by the same binary that serves it, from the same app, so the checked
 * in document cannot describe a surface the daemon does not have. The throwaway
 * pool is never read: registering the routes is all this needs.
 */
async function writeOpenApi(): Promise<void> {
  const pool = openPool(":memory:", EMPTY_POOL);
  try {
    const document = createApp(pool).getOpenAPI31Document(OPENAPI_INFO);
    writeFileSync(OPENAPI_FILE, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`wrote ${OPENAPI_FILE}`);
  } finally {
    await pool.close();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { config: { type: "string" }, openapi: { type: "boolean" } },
    strict: true,
  });

  if (values.openapi === true) return writeOpenApi();

  const config = loadConfig(values.config);
  mkdirSync(dirname(config.pool), { recursive: true });

  const pool = openPool(config.pool, config.poolConfig);
  const server = serve(
    {
      fetch: createApp(pool).fetch,
      hostname: BIND,
      port: config.port,
    },
    // Announced on listening, not on starting: a daemon that says it is serving
    // and then dies on the next line is worse than one that says nothing.
    (address) =>
      console.log(`notemap: ${config.pool} on http://${BIND}:${address.port}`),
  );

  // Something already on the port is the ordinary mistake — a daemon left
  // running — and deserves a sentence rather than a stack trace.
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `port ${config.port} is already in use; stop what is on it, or set daemon.port`
        : error.message,
    );
    void pool.close().then(() => process.exit(1));
  });

  /**
   * The host closes the pool it built, and closes nothing else: which ports
   * hold something open is core's to know.
   *
   * `close()` alone is not enough. It stops the listener and then waits for
   * every connection, and a browser that has finished asking for things still
   * holds an idle keep-alive socket open — so a daemon told to stop would sit
   * there until the client got bored. Idle sockets go immediately; a request
   * still in flight gets a moment to finish before it is cut off too.
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
    setTimeout(() => sockets.closeAllConnections?.(), 2_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

await main();
