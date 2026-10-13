/** How much a driver holds, in whatever terms its own layout makes true. */
export type StoreFootprint = {
  /** Everything the database takes, the files it keeps beside its own included. */
  readonly bytes: number;
  /** Of those bytes, how many it holds and is not using. */
  readonly unused: number;
};

/**
 * What the mirror holds. Records and files are apart because an item is a
 * `.json` and a `.md` beside it, so any other ratio is a rendering that never
 * landed. A driver's own debris is in neither.
 */
export type MirrorFootprint = {
  readonly records: number;
  readonly files: number;
  readonly bytes: number;
};

/** How many of something, and how much it takes. */
export type Tally = {
  readonly count: number;
  readonly bytes: number;
};

/**
 * Every asset the pool holds, with their sizes summed — so two assets naming
 * one blob are counted twice — and how much of that sum the disk never paid
 * for, the same bytes under two names being stored once.
 */
export type AssetsHeld = Tally & {
  readonly saved: number;
};

/** What the pool has written down about its own bytes. Nothing here is walked. */
export type RecordedStorage = {
  readonly store: StoreFootprint;
  /**
   * The registry's own figures. What `measure` counts is every blob on the
   * disk, assets' and routing records' outputs alike, so the two totals are
   * about different populations and neither explains the other: what content
   * addressing saved is answered here rather than left to a subtraction.
   */
  readonly assets: AssetsHeld;
};

/** What a walk over the blob store and the mirror found. */
export type MeasuredStorage = {
  readonly blobs: Tally;
  /** Blobs nothing names that are past the grace window: what a reclaim would take now. */
  readonly reclaimable: Tally;
  /** Blobs nothing names that are still inside it, which a reclaim passes over. */
  readonly withinGrace: Tally;
  /** Absent where no mirror is wired. */
  readonly mirror?: MirrorFootprint;
};

/** What a reclaim took. */
export type ReclaimOutcome = {
  readonly blobs: number;
  readonly bytes: number;
};
