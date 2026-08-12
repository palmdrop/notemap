import type { AssetId, BlobHash, Duration } from "./ids";

export type Asset = {
  readonly id: AssetId;
  readonly filename: string;
  readonly mime: string;
  readonly blob: BlobHash;
  readonly bytes: number;
};

export type AssetMeta = {
  readonly filename: string;
  readonly mime: string;
};

export type BlobIntegrity = "intact" | "drifted" | "missing";

/** What a blob store answers about bytes it has taken: their name, and how many there were. */
export type StoredBlob = {
  readonly hash: BlobHash;
  readonly bytes: number;
};

/**
 * How long an unreferenced asset is left alone before a sweep may take it. To a
 * sweep running at the wrong instant, "referenced" and "about to be referenced"
 * look identical.
 */
export type SweepPolicy = {
  readonly grace: Duration;
};

/**
 * No hash: with server-minted asset ids it was the client copying back a number
 * the server handed it, and a corrupted blob is invisible to it because the row
 * and the reference agree.
 */
export type AssetRef = {
  readonly slot: string;
  readonly asset: AssetId;
};
