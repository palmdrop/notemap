import { parseArgs } from "node:util";

import { arenaAt } from "./arena/read";
import { loadConfig, readSecret, type RelayConfig } from "./config/load";
import { FULL_SCAN_MS } from "./constants";
import { relayInto } from "./relay";
import { relayEverything, said, type ChannelTarget, type Log } from "./run";
import { sleep } from "./utils/sleep";

const USAGE = `notemap-relay-arena — put what is connected into a watched are.na channel into a notemap pool.

  notemap-relay-arena [--config <path>] [--once [--full]]

It holds nothing. Every poll reads each watched channel newest connection
first, captures each block, and stops at the first page the pool already
has. The first poll, and one a day after it, reads every page instead —
which is where an edit further down a channel amends or revises the item it
became.

--once polls exactly once and exits, for a run by hand or from cron. It stops
early like any other poll unless --full is given. It exits non-zero if
anything at all went wrong; the timer, left to itself, logs a failed poll and
tries again at the next one.

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
async function poll(
  config: RelayConfig,
  full: boolean,
  signal: AbortSignal,
): Promise<boolean> {
  const arena = arenaAt({
    token: readSecret(config.arena.token, "the arena token"),
    // Never in the config file — are.na's address is a constant of the
    // service. This exists so a test can run the real binary against a fake
    // are.na, the same way `ArenaConfig.baseUrl` lets destination-arena's own
    // suite do it in-process.
    ...(process.env["NOTEMAP_RELAY_ARENA_API"] === undefined
      ? {}
      : { baseUrl: process.env["NOTEMAP_RELAY_ARENA_API"] }),
  });
  const poolToken = readSecret(config.pool.token, "the pool token");

  const channels: ChannelTarget[] = config.channels.map((channel) => ({
    ...channel,
    relay: relayInto(
      { url: config.pool.url, token: poolToken },
      channel.source,
    ),
  }));

  if (full) log.note("reading every page of every channel");
  const reports = await relayEverything(arena, channels, log, { full, signal });

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
      full: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
  });

  if (values.help === true) {
    console.log(USAGE);
    return;
  }

  if (values.full === true && values.once !== true) {
    throw new Error("--full goes with --once; the timer schedules its own");
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
    const clean = await poll(config, values.full === true, stopping.signal);
    if (!clean) process.exitCode = 1;
    return;
  }

  log.note(`polling every ${String(config.poll.intervalMs)}ms`);

  // One poll at a time, and the next is due when this one is done: a scan that
  // outlasts the interval is a large backlog, not a reason to start a second.
  let fullDue = 0;
  while (!stopping.signal.aborted) {
    const full = Date.now() >= fullDue;
    try {
      await poll(config, full, stopping.signal);
      if (full) fullDue = Date.now() + FULL_SCAN_MS;
    } catch (cause) {
      if (stopping.signal.aborted) break;
      log.fault("the poll could not be finished", cause);
    }

    await sleep(config.poll.intervalMs, stopping.signal);
  }
}

start().catch((error: unknown) => {
  console.error(`relay-arena: ${message(error)}`);
  process.exit(1);
});
