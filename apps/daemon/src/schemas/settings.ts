import "@hono/zod-openapi";
import { z } from "zod";

export const poolSettingSchema = z
  .object({
    name: z.string(),
    /** The only value type built so far. */
    value: z.boolean(),
  })
  .openapi("PoolSetting");

export const poolSettingsSchema = z
  .object({ values: z.array(poolSettingSchema) })
  .openapi("PoolSettings");

/**
 * Every value is `unknown` here and checked by core against the setting's own
 * type: a schema that already typed it `boolean` would turn a wrong type into
 * a `400` this route never gets to answer as `pool-setting-invalid`.
 */
export const updatePoolSettingsRequestSchema = z
  .record(z.string().min(1), z.unknown())
  .refine((body) => Object.keys(body).length === 1, "exactly one pool setting")
  .openapi("UpdatePoolSettingsRequest");
