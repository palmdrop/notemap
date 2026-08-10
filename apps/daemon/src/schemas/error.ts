import "@hono/zod-openapi";
import { z } from "zod";

export function errorSchema(codes: readonly [string, ...string[]]) {
  return z.object({
    error: z.looseObject({ code: z.enum(codes) }).openapi({
      description: "The refusal's kind, with its facts beside it.",
    }),
  });
}
