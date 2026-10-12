import "@hono/zod-openapi";
import { z } from "zod";

const bytes = z.number().int().nonnegative();

/** Absent where the filesystem would not say. Never zero in its place. */
const free = bytes.optional();

const tally = {
  count: z.number().int().nonnegative(),
  bytes,
};

export const storageSchema = z
  .object({
    pool: z.object({
      path: z.string(),
      bytes,
      /** Bytes the database holds and is not using: why a pool that lost items did not shrink. */
      unused: bytes,
      free,
    }),
    assets: z.object({
      path: z.string(),
      /** Every asset the registry holds, so two naming one blob are counted twice. */
      ...tally,
      free,
    }),
    /** Absent where no mirror is configured. */
    mirror: z.object({ path: z.string(), free }).optional(),
    /** The daemon's own database, which is no part of the pool. */
    auth: z.object({ path: z.string(), bytes }).optional(),
    /** What this daemon says it is deployed as. Absent claims nothing. */
    deployment: z.string().optional(),
    /** The last measurement taken, with when it was taken. Absent until one is. */
    measured: z
      .object({
        at: z.string(),
        blobs: z.object(tally),
        /** What a reclaim would take now. */
        reclaimable: z.object(tally),
        /** What it would pass over, the grace window not having run out. */
        withinGrace: z.object(tally),
        mirror: z
          .object({
            records: z.number().int().nonnegative(),
            files: z.number().int().nonnegative(),
            bytes,
          })
          .optional(),
      })
      .optional(),
  })
  .openapi("Storage");

export const reclaimedSchema = z
  .object({ blobs: z.number().int().nonnegative(), bytes })
  .openapi("Reclaimed");
