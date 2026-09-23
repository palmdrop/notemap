import { parseArgs } from "node:util";

import { arenaAt } from "./arena/read";
import { loadConfig, readSecret, type RelayConfig } from "./config/load";
import { relayInto } from "./relay";
import { relayEverything, said, type ChannelTarget, type Log } from "./run";

const USAGE = `notemap-relay-arena — put what is connected into a watched are.na channel into a notemap pool.

  notemap-relay-arena [--config <path>] [--once]

It holds nothing. Every poll reads every watched channel and captures each
block; the pool answers for what it already has, and a block edited upstream
amends or revises the item it became.

--once polls exactly once and exits, for a run by hand or from cron. It exits
non-zero if anything at all went wrong; the timer, left to itself, logs a
failed poll and tries again at the next one.

The config is --config <path>, then NOTEMAP_RELAY_ARENA_CONFIG, then
~/.config/notemap/relay-arena.toml.`;

const log: Log = {
  note: (line) => {
    console.log(`relay-arena: ${line}`);
  },
  fault: (line, cause) => {
    console.error(
      `relay-arena: ${line}${cause === undefined ? "" : `: ${message(cause)}`}`,
    );
  },
};

/** The chain, not the top of it: what `fetch` could not do is under two wrappers. */
function message(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);

  return cause.cause === undefined
    ? cause.message
    : `${cause.message}: ${message(cause.cause)}`;
}

/**
 * The tokens are read here rather than held from startup, so rotating either
 * one is writing the file it lives in and never restarting the relay.
 *
 * Says each channel's tally as it finishes, since a poll here is many
 * channels rather than one upstream. Answers whether the whole poll was
 * clean, which is what decides `--once`'s exit code.
 */
async function poll(config: RelayConfig, signal: AbortSignal): Promise<boolean> {
  const arena = arenaAt({
    token: readSecret(config.arena.token, "the arena token"),
  });
  const poolToken = readSecret(config.pool.token, "the pool token");

  const channels: ChannelTarget[] = config.channels.map((channel) => ({
    ...channel,
    relay: relayInto(
      { url: config.pool.url, token: poolToken },
      channel.source,
    ),
  }));

  const reports = await relayEverything(arena, channels, log, signal);

  let clean = true;
  for (const report of reports) {
    log.note(`${report.source}: ${said(report.tally)}`);
    if (report.readFailed || report.tally.failed > 0) clean = false;
  }
  return clean;
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
    `${String(config.channels.length)} channel(s) into ${config.pool.url}`,
  );

  const stopping = new AbortController();
  const stop = () => {
    stopping.abort();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  if (values.once === true) {
    const clean = await poll(config, stopping.signal);
    if (!clean) process.exitCode = 1;
    return;
  }

  log.note(`polling every ${String(config.poll.intervalMs)}ms`);

  // One poll at a time, and the next is due when this one is done: a scan that
  // outlasts the interval is a large backlog, not a reason to start a second.
  while (!stopping.signal.aborted) {
    try {
      await poll(config, stopping.signal);
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
  console.error(`relay-arena: ${message(error)}`);
  process.exit(1);
});
