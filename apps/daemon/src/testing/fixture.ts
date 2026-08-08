import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OpenAPIHono } from "@hono/zod-openapi";

import type {
  Duration,
  PayloadTypeName,
  PoolConfig,
  SourceId,
} from "@notemap/core";

import { createApp } from "../app";
import { openPool } from "../ports";

export const WEB = "web" as SourceId;
export const TEXT = "text" as PayloadTypeName;

/** The daemon's example config, as core takes it. */
export const CONFIG: PoolConfig = {
  sources: [{ id: WEB, autoRequest: [] }],
  payloadTypes: [
    {
      name: TEXT,
      contentSchema: {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: { text: { type: "string", minLength: 1 } },
      },
      requiredSlots: [],
    },
  ],
  enrichments: [],
  retry: {
    maxAttempts: 5,
    initialBackoff: 1000 as Duration,
    maxBackoff: 60_000 as Duration,
  },
};

export type Daemon = {
  readonly app: OpenAPIHono;
  readonly cleanup: () => Promise<void>;
};

export function daemon(config: PoolConfig = CONFIG): Daemon {
  const directory = mkdtempSync(join(tmpdir(), "notemap-daemon-"));
  const pool = openPool(join(directory, "pool.db"), config);

  return {
    app: createApp(pool),
    cleanup: async () => {
      await pool.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

type EnvelopeOverrides = {
  readonly id?: string;
  readonly source?: string;
  readonly sourceItemId?: string;
  readonly text?: string;
  readonly capturedAt?: string;
  readonly tags?: readonly string[];
};

export function envelope(overrides: EnvelopeOverrides = {}) {
  const id = overrides.id ?? "0198f0c2-0000-7000-8000-000000000001";
  return {
    id,
    source: overrides.source ?? WEB,
    sourceItemId: overrides.sourceItemId ?? id,
    capturedAt: overrides.capturedAt ?? "2026-08-08T09:00:00.000Z",
    payload: {
      type: TEXT,
      content: { text: overrides.text ?? "a thought" },
      metadata: {},
      assets: [],
    },
    ...(overrides.tags === undefined ? {} : { tags: overrides.tags }),
  };
}

export async function post(app: OpenAPIHono, body: unknown): Promise<Response> {
  return app.request("/v1/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Captures `count` items one minute apart, oldest first, and returns their ids. */
export async function captureMany(
  app: OpenAPIHono,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `0198f0c2-0000-7000-8000-00000000000${index}`;
    const response = await post(
      app,
      envelope({ id, capturedAt: `2026-08-08T09:0${index}:00.000Z` }),
    );
    if (response.status !== 201) {
      throw new Error(`capture failed: ${await response.text()}`);
    }
    ids.push(id);
  }
  return ids;
}
