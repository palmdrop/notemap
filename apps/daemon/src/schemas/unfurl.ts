import "@hono/zod-openapi";
import { z } from "zod";

export const unfurlSchema = z
  .object({
    url: z.string().openapi({ description: "As asked." }),
    reached: z.boolean().openapi({
      description:
        "False where nothing could be read: the target was unreachable, timed out, or did not answer a success. Not a refusal.",
    }),
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional().openapi({
      description: "Absolute, `http` or `https`. Fetched by whoever draws it.",
    }),
    siteName: z.string().optional(),
  })
  .openapi("Unfurl");

export const unfurlQuery = z.object({
  url: z
    .string()
    .min(1)
    .openapi({
      param: { name: "url", in: "query" },
      description: "`http` or `https`, with no credentials in it.",
      example: "https://example.org/",
    }),
});
