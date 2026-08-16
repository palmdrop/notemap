import { api } from "./client";
import { readError } from "./errors";
import type { CaptureOutcome } from "./types";
import { uuidv7 } from "$lib/uuid";

const SOURCE = "web";
const TEXT = "text";
const IMAGE = "image";
/** The slot `image` captures declare required, per the example config. */
const SLOT = "image";

export async function capture(input: {
  readonly text: string;
  readonly asset?: string;
}): Promise<CaptureOutcome> {
  const id = uuidv7();
  const payload =
    input.asset === undefined
      ? { type: TEXT, content: { text: input.text } }
      : {
          type: IMAGE,
          content: input.text.trim() === "" ? {} : { caption: input.text },
        };

  const { data, error } = await api.POST("/v1/captures", {
    body: {
      id,
      source: SOURCE,
      sourceItemId: id,
      capturedAt: new Date().toISOString(),
      payload: {
        ...payload,
        metadata: {},
        assets:
          input.asset === undefined ? [] : [{ slot: SLOT, asset: input.asset }],
      },
    },
  });

  if (error !== undefined) throw new Error(readError(error));
  return data;
}
