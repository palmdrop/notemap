import type {
  AssetsHeld,
  MeasuredStorage,
  StoreFootprint,
  Timestamp,
} from "@notemap/core";

import type { Deployment } from "./deployment";

/** Where something is, and how much room is left where it lives. */
export type Root = {
  readonly path: string;
  /** Absent where the filesystem would not say. Never zero in its place. */
  readonly free?: number;
};

/** A measurement, and when it was taken. Nothing ages it out; `at` is what says. */
export type Measurement = MeasuredStorage & { readonly at: Timestamp };

/**
 * What notemap has taken on this machine. Everything outside `measured` is
 * answered on the spot and walks nothing.
 */
export type StorageReport = {
  readonly pool: Root & StoreFootprint;
  readonly assets: Root & AssetsHeld;
  /** Absent where no mirror is configured. */
  readonly mirror?: Root;
  /** The daemon's own database, which is no part of the pool. Absent where it holds none. */
  readonly auth?: { readonly path: string; readonly bytes: number };
  /** What this daemon says it is deployed as. Absent claims nothing. */
  readonly deployment?: Deployment;
  /** Absent on a daemon that has never measured. Never zeroes in its place. */
  readonly measured?: Measurement;
};
