import { parseArgs } from "node:util";

import { loadConfig, readSecret, type RelayConfig } from "./config/load";
import { memosAt } from "./memos/read";
import { relayInto } from "./relay";
import { relayEverything, said, type Log, type Tally } from "./run";

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

const log: Log = {
  note: (line) => {
    console.log(`relay-memos: ${line}`);
  },
  fault: (line, cause) => {
    console.error(
      `relay-memos: ${line}${cause === undefined ? "" : `: ${message(cause)}`}`,
    );
  },
};

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The tokens are read here rather than held from startup, so rotating either
 * one is writing the file it lives in and never restarting the relay.
 */
async function poll(config: RelayConfig, signal: AbortSignal): Promise<Tally> {
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

  if (values.help === true) {
    console.log(USAGE);
    return;
  }

  const config = loadConfig(values.config);
  log.note(
    `${config.memos.url} into ${config.pool.url} as ${config.pool.source}`,
  );

  const stopping = new AbortController();
  const stop = () => {
    stopping.abort();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  if (values.once === true) {
    const tally = await poll(config, stopping.signal);
    log.note(said(tally));
    if (tally.failed > 0) process.exitCode = 1;
    return;
  }

  log.note(`polling every ${String(config.poll.intervalMs)}ms`);

  // One poll at a time, and the next is due when this one is done: a scan that
  // outlasts the interval is a large backlog, not a reason to start a second.
  while (!stopping.signal.aborted) {
    try {
      log.note(said(await poll(config, stopping.signal)));
    } catch (cause) {
      if (stopping.signal.aborted) break;
      log.fault("the poll could not be finished", cause);
    }

    await waiting(config.poll.intervalMs, stopping.signal);
  }
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

start().catch((error: unknown) => {
  console.error(`relay-memos: ${message(error)}`);
  process.exit(1);
});
