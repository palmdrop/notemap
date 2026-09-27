import { parseArgs } from "node:util";

import { createLogger, reasonOf, type Logger } from "@notemap/log";

import { loadConfig, readSecret, type RelayConfig } from "./config/load";
import { memosAt } from "./memos/read";
import { relayInto } from "./relay";
import { relayEverything, type Tally } from "./run";

const USAGE = `notemap-relay-memos — put what is in Memos into a notemap pool.

  notemap-relay-memos [--config <path>] [--once]

It holds nothing. Every poll reads every memo and captures it; the pool
answers for what it already has, and a memo that changed upstream amends or
revises the item it became.

--once polls exactly once and exits, for a run by hand or from cron. It exits
non-zero if anything at all went wrong; the timer, left to itself, logs a
failed poll and tries again at the next one.

The config is --config <path>, then NOTEMAP_RELAY_MEMOS_CONFIG, then
~/.config/notemap/relay-memos.toml.`;

/**
 * The tokens are read here rather than held from startup, so rotating either
 * one is writing the file it lives in and never restarting the relay.
 */
async function poll(
  config: RelayConfig,
  log: Logger,
  signal: AbortSignal,
): Promise<Tally> {
  const memos = memosAt({
    url: config.memos.url,
    token: readSecret(config.memos.token, "the memos token"),
  });
  const relay = relayInto(
    config,
    readSecret(config.pool.token, "the pool token"),
  );

  return relayEverything(memos, relay, log, signal);
}

async function start(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      once: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
  });

  // Program output, not a log: somebody asked a question at a terminal.
  if (values.help === true) {
    console.log(USAGE);
    return;
  }

  const config = loadConfig(values.config);
  const log = createLogger(config.log);

  // Everything from here on says so through the log, including the failure that
  // ends the run — a cron line that failed at four in the morning is worth a
  // clock as much as a successful poll is.
  try {
    await relaying(config, log, values.once === true);
  } catch (cause) {
    log.error({ err: cause }, "the relay stopped");
    process.exitCode = 1;
  }
}

async function relaying(
  config: RelayConfig,
  log: Logger,
  once: boolean,
): Promise<void> {
  log.info(
    {
      memos: config.memos.url,
      pool: config.pool.url,
      source: config.pool.source,
    },
    "relaying",
  );

  const stopping = new AbortController();
  const stop = () => {
    stopping.abort();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  if (once) {
    const tally = await poll(config, log, stopping.signal);
    log.info(tally, "polled");
    if (tally.failed > 0) process.exitCode = 1;
    return;
  }

  log.info({ everyMs: config.poll.intervalMs }, "polling");

  // One poll at a time, and the next is due when this one is done: a scan that
  // outlasts the interval is a large backlog, not a reason to start a second.
  while (!stopping.signal.aborted) {
    try {
      log.info(await poll(config, log, stopping.signal), "polled");
    } catch (cause) {
      if (stopping.signal.aborted) break;
      log.error({ err: cause }, "the poll could not be finished");
    }

    await waiting(config.poll.intervalMs, stopping.signal);
  }

  log.info("stopping");
}

function waiting(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", wake);
      resolve();
    }, ms);

    function wake(): void {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", wake, { once: true });
  });
}

/**
 * Whatever went wrong before there was a logger — a config that will not load,
 * a token that cannot be read — has nowhere to go but the stream, which is
 * where the log would have gone anyway.
 */
start().catch((error: unknown) => {
  console.error(`relay-memos: ${reasonOf(error)}`);
  process.exit(1);
});
