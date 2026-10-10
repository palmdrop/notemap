import type { AssetId, BlobHash, Duration, Timestamp } from "./ids";

export type Asset = {
  readonly id: AssetId;
  readonly filename: string;
  readonly mime: string;
  readonly blob: BlobHash;
  readonly bytes: number;
  /** A picture's, as it is drawn: read from its bytes, and absent where they could not say. */
  readonly dimensions?: Dimensions;
};

/** Upright, a photograph's orientation already applied. */
export type Dimensions = {
  readonly width: number;
  readonly height: number;
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

/** A blob a store holds, and when its bytes were last put. */
export type ListedBlob = {
  readonly hash: BlobHash;
  /** The wall clock's, since the store keeps it: a pool given another clock compares the two. */
  readonly at: Timestamp;
};

/** How long an unreferenced asset is left alone before a sweep may take it, and an unnamed blob before a reclaim may. */
export type SweepPolicy = {
  readonly grace: Duration;
};

export type AssetRef = {
  readonly slot: string;
  readonly asset: AssetId;
};
