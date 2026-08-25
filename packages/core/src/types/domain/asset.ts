import type { AssetId, BlobHash, Duration } from "./ids";

export type Asset = {
  readonly id: AssetId;
  readonly filename: string;
  readonly mime: string;
  readonly blob: BlobHash;
  readonly bytes: number;
};

export type AssetOutcome =
  | { readonly kind: "stored"; readonly asset: Asset }
  | { readonly kind: "already-stored"; readonly asset: Asset };

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

/** How long an unreferenced asset is left alone before a sweep may take it. */
export type SweepPolicy = {
  readonly grace: Duration;
};

export type AssetRef = {
  readonly slot: string;
  readonly asset: AssetId;
};
