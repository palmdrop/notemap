import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPool,
  type AssetStore,
  type CaptureEnvelope,
  type Clock,
  type Duration,
  type IdGenerator,
  type MintableId,
  type ItemId,
  type MirrorWriter,
  type PayloadTypeName,
  type Pool,
  type PoolConfig,
  type PoolPorts,
  type SourceId,
  type TagName,
  type Timestamp,
} from "@notemap/core";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { createSqlitePoolStore } from "@notemap/store-sqlite";

/** A source that mints and replays its own capture ids: a client with an outbox. */
export const SCRATCHPAD = "scratchpad" as SourceId;

/** A source that supplies none, and is known only by its own id for a thing. */
export const WATCHED_FOLDER = "watched-folder" as SourceId;

export const TEXT = "text" as PayloadTypeName;
export const NOTE = "note" as PayloadTypeName;

export function at(value: string): Timestamp {
  return value as Timestamp;
}

export function tag(name: string): TagName {
  return name as TagName;
}

export const CONFIG: PoolConfig = {
  sources: [
    { id: SCRATCHPAD, autoRequest: [] },
    { id: WATCHED_FOLDER, autoRequest: [] },
  ],
  payloadTypes: [
    {
      name: TEXT,
      contentSchema: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string" } },
      },
      requiredSlots: [],
    },
    {
      name: NOTE,
      contentSchema: {
        type: "object",
        required: ["body"],
        properties: { body: { type: "string" } },
      },
      requiredSlots: ["recording"],
    },
  ],
  enrichments: [],
  retry: {
    maxAttempts: 5,
    initialBackoff: 1000 as Duration,
    maxBackoff: 60000 as Duration,
  },
};

/** A clock that stands still until a test moves it. */
export function frozenClock(start = "2026-08-06T09:00:00.000Z"): Clock & {
  set: (value: string) => void;
} {
  let current = start;
  return {
    now: () => at(current),
    set: (value) => {
      current = value;
    },
  };
}

/**
 * Counts. `next` takes no argument saying what it is minting, so one counter
 * serves every id kind and the sequence is shared — which is why the tests read
 * ids off what they get back rather than predicting them.
 */
export function countingIds(): IdGenerator & { issued: () => number } {
  let count = 0;
  return {
    next: <T extends MintableId>() => `id-${++count}` as T,
    issued: () => count,
  };
}

function absent(port: string): never {
  throw new Error(`no ${port} is wired in these tests`);
}

const noAssets: AssetStore = {
  store: () => absent("asset store"),
  get: () => absent("asset store"),
  open: () => absent("asset store"),
  verify: () => absent("asset store"),
  release: () => absent("asset store"),
};

/** Wired but never called: its presence is what makes the mirror enabled. */
const noMirrorWriter: MirrorWriter = {
  write: () => absent("mirror writer"),
  remove: () => absent("mirror writer"),
};

export type Harness = {
  readonly pool: Pool;
  readonly clock: ReturnType<typeof frozenClock>;
  readonly ids: ReturnType<typeof countingIds>;
  readonly file: string;
  readonly cleanup: () => Promise<void>;
};

/**
 * A pool wired the way a host wires one, over the SQLite store on a real file.
 * Files rather than `:memory:`, because an in-memory database cannot have the
 * second connection the driver's reads use.
 */
export function harness(config: PoolConfig = CONFIG): Harness {
  const directory = mkdtempSync(join(tmpdir(), "notemap-integration-"));
  const file = join(directory, "pool.db");
  const clock = frozenClock();
  const ids = countingIds();

  const ports: PoolPorts = {
    store: createSqlitePoolStore({ file, clock }),
    clock,
    ids,
    schemas: createAjvSchemaValidator(),
    assets: noAssets,
    mirrorWriter: noMirrorWriter,
    destinations: [],
  };

  const pool = createPool(config, ports);

  return {
    pool,
    clock,
    ids,
    file,
    cleanup: async () => {
      await pool.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

type EnvelopeOverrides = {
  readonly id?: string;
  readonly source?: SourceId;
  readonly sourceItemId?: string;
  readonly text?: string;
  readonly capturedAt?: string;
  readonly tags?: readonly string[];
};

export function envelope(overrides: EnvelopeOverrides = {}): CaptureEnvelope {
  return {
    ...(overrides.id === undefined ? {} : { id: overrides.id as ItemId }),
    source: overrides.source ?? SCRATCHPAD,
    sourceItemId: overrides.sourceItemId ?? "src-1",
    capturedAt: at(overrides.capturedAt ?? "2026-08-06T09:00:00.000Z"),
    payload: {
      type: TEXT,
      content: { text: overrides.text ?? "a thought" },
      metadata: {},
      assets: [],
    },
    ...(overrides.tags === undefined ? {} : { tags: overrides.tags.map(tag) }),
  };
}
