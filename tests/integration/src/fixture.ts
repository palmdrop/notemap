import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPool,
  type Asset,
  type AssetId,
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
  type PoolStore,
  type SourceId,
  type TagName,
  type Timestamp,
} from "@notemap/core";
import { createFilesystemBlobStore } from "@notemap/blob-fs";
import { createFilesystemMirrorWriter } from "@notemap/mirror-fs";
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
  sweep: { grace: 86_400_000 as Duration },
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
export function countingIds(
  prefix = "id",
): IdGenerator & { issued: () => number } {
  let count = 0;
  return {
    next: <T extends MintableId>() => `${prefix}-${++count}` as T,
    issued: () => count,
  };
}

function absent(port: string): never {
  throw new Error(`no ${port} is wired in these tests`);
}

const noMirrorWriter: MirrorWriter = {
  write: () => absent("mirror writer"),
  remove: () => absent("mirror writer"),
};

export type Harness = {
  readonly pool: Pool;
  /** Reachable so a test can stand in for a mutation core cannot perform yet. */
  readonly store: PoolStore;
  readonly clock: ReturnType<typeof frozenClock>;
  readonly ids: ReturnType<typeof countingIds>;
  readonly file: string;
  /** Where the mirror writes, whether or not a real writer is wired. */
  readonly mirrorRoot: string;
  /** Where the blobs are. A sibling of the two, as a host lays them out. */
  readonly assetRoot: string;
  readonly cleanup: () => Promise<void>;
};

/**
 * `stub` wires a writer that is never called: its presence is what makes the
 * mirror enabled, so capture still records that a write is owed. `off` wires
 * none at all, which is the disabled mirror.
 */
export type Mirroring = "stub" | "filesystem" | "off";

/**
 * A pool wired the way a host wires one, over the SQLite store on a real file.
 * Files rather than `:memory:`, because an in-memory database cannot have the
 * second connection the driver's reads use.
 */
export function harness(
  config: PoolConfig = CONFIG,
  mirroring: Mirroring = "stub",
): Harness {
  const directory = mkdtempSync(join(tmpdir(), "notemap-integration-"));
  const file = join(directory, "pool.db");
  const mirrorRoot = join(directory, "pool-mirror");
  const assetRoot = join(directory, "assets");
  const clock = frozenClock();
  const ids = countingIds();

  // Lease ids are the store's to mint, so it gets its own sequence.
  const store = createSqlitePoolStore({
    file,
    clock,
    ids: countingIds("lease"),
  });

  const ports: PoolPorts = {
    store,
    work: store,
    clock,
    ids,
    schemas: createAjvSchemaValidator(),
    blobs: createFilesystemBlobStore({ root: assetRoot }),
    ...(mirroring === "off"
      ? {}
      : {
          mirrorWriter:
            mirroring === "filesystem"
              ? createFilesystemMirrorWriter({ root: mirrorRoot })
              : noMirrorWriter,
        }),
    destinations: [],
  };

  const pool = createPool(config, ports);

  return {
    pool,
    store,
    clock,
    ids,
    file,
    mirrorRoot,
    assetRoot,
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
  readonly assets?: readonly { slot: string; asset: string }[];
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
      assets: (overrides.assets ?? []).map((ref) => ({
        slot: ref.slot,
        asset: ref.asset as AssetId,
      })),
    },
    ...(overrides.tags === undefined ? {} : { tags: overrides.tags.map(tag) }),
  };
}

export function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export async function* streamOf(
  ...chunks: readonly Uint8Array[]
): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

export async function collect(
  stream: AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);

  const joined = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/** Uploads content under a name, and answers the asset that names it. */
export async function upload(
  pool: Pool,
  filename: string,
  content: Uint8Array,
  mime = "image/png",
): Promise<Asset> {
  const result = await pool.assets.store(streamOf(content), { filename, mime });
  if (result.kind === "refused") {
    throw new Error(`upload refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}
