import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { startSweeper } from "./assets/sweeper";
import { cookieOptionsFor, loadConfig } from "./config/load";
import { SHUTDOWN_GRACE_MS } from "./constants";
import { startDeliveryRunner } from "./destinations/runner";
import { startMirrorRunner } from "./mirror/runner";
import { openAccounts, openAuth, openPool, systemClock } from "./ports";
import { runCliCommand } from "./cli";
import { FORGET_EXPIRED_EVERY_MS } from "./auth/config";
import { provisionCredential } from "./auth/provision";
import { createLoginThrottle } from "./auth/throttle";
import { createLogger } from "./log";
import { createUnfurler, pinnedFetch, systemResolve } from "./unfurl";

async function start(): Promise<void> {
  const { values } = parseArgs({
    options: { config: { type: "string" } },
    strict: true,
  });

  const { config, warnings } = loadConfig(values.config);
  const log = createLogger(config.log);

  for (const key of warnings) {
    log.warn({ key }, "ignoring a config key this daemon does not know");
  }

  const cookies = cookieOptionsFor(config.origin);

  if (!cookies.secure) {
    log.warn(
      { origin: config.origin },
      "the origin is plain HTTP, so a session cookie crosses the network in the clear — put TLS in front of the daemon",
    );
  }

  mkdirSync(dirname(config.auth), { recursive: true });

  const { auth, store: authStore } = openAuth(
    {
      file: config.auth,
    },
    {
      clock: systemClock,
      log,
    },
  );

  const accounts = await openAccounts({
    store: authStore,
    config: config.accounts,
    clock: systemClock,
  });

  for (const each of accounts.shadowed()) {
    log.warn(
      { account: `${each.name} (${each.kind})` },
      "an account held by the daemon has the same kind and name as one in the config, so the config one is ignored",
    );
  }

  mkdirSync(dirname(config.pool), { recursive: true });

  const {
    pool,
    ports,
    mirrorWriter,
    destinations,
    warnings: wired,
  } = openPool({
    file: config.pool,
    config: config.poolConfig,
    assetRoot: config.assets.root,
    ...(config.mirror === undefined ? {} : { mirrorRoot: config.mirror.root }),
    accounts,
    log,
  });

  // What the adapters make of the accounts they were handed. The daemon prints
  // it and does not author it: which kinds exist is `ports.ts`'s knowledge.
  for (const line of wired) {
    log.warn(line);
  }

  // Before anything listens: a daemon told to arrive with a door must not
  // answer a request through the moment before it has one.
  await provisionCredential(auth, process.env, log);

  // Nothing waits on this: an expired session or token is refused whether or
  // not it has been swept, so a failed sweep costs a row rather than a refusal.
  const forgetExpired = () => {
    void auth
      .forgetExpired()
      .catch((cause: unknown) =>
        log.error({ err: cause }, "could not sweep expired sessions"),
      );
  };

  forgetExpired();
  const forgetting = setInterval(forgetExpired, FORGET_EXPIRED_EVERY_MS);
  forgetting.unref();

  const mirror =
    config.mirror === undefined || mirrorWriter === undefined
      ? undefined
      : startMirrorRunner(pool, mirrorWriter, config.mirror, log);

  // Unconditional: a destination is a row a person may add at any moment, so
  // no startup fact says a delivery job cannot exist.
  const delivery = startDeliveryRunner(
    pool,
    destinations,
    config.delivery,
    log,
  );

  const sweeper = startSweeper(pool, config.sweep, log);

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
        accounts,
        cookies,
        ...(config.origin === undefined ? {} : { origin: config.origin }),
        throttle: createLoginThrottle({ clock: ports.clock }),
        log,
        unfurler: createUnfurler({
          resolve: systemResolve,
          fetch: pinnedFetch,
          now: Date.now,
        }),
      }).fetch,
      hostname: config.host,
      port: config.port,
    },
    (address) => {
      // The address line is what a supervisor reads readiness from.
      log.info(`${config.pool} on http://${config.host}:${address.port}`);
      if (config.mirror === undefined) {
        log.info("no mirror configured — the pool is the only copy");
      } else {
        log.info({ mirror: config.mirror.root }, "mirroring");
      }
      log.info({ assets: config.assets.root }, "assets");

      const held = accounts.list();
      if (held.length > 0) {
        log.info(
          {
            accounts: held.map(
              (each) => `${each.name} (${each.kind}, ${each.from})`,
            ),
          },
          "accounts",
        );
      }

      void pool.destinations.list().then((held) => {
        if (held.length === 0) {
          log.info("no destinations yet — add one to route anything out");
        } else {
          log.info(
            { destinations: held.map((each) => each.name) },
            "destinations",
          );
        }
      });

      void auth.requiresCredentials().then((asks) => {
        log.info(
          { signIn: asks ? "required" : "open" },
          asks
            ? "signing in is required to reach /v1"
            : "no password set — every request is let through; `notemap password set` closes the door",
        );
      });
    },
  );

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      log.error(
        { port: config.port },
        "the port is already in use; stop what is on it, or set daemon.port",
      );
    } else {
      log.error({ err: error }, "the server could not listen");
    }
    void close().then(() => process.exit(1));
  });

  /**
   * `close()` waits for every connection, and a browser holds an idle
   * keep-alive socket long after it has finished asking for things. Idle
   * sockets go at once; work in flight gets a moment.
   */
  const shutdown = () => {
    log.info("shutting down");
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

  return start();
};

entry().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
