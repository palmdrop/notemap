import { fileURLToPath } from "node:url";

import { OpenAPIHono } from "@hono/zod-openapi";

import { ROUTES } from "./routes/definitions";

export const OPENAPI_FILE = fileURLToPath(
  new URL("../openapi.json", import.meta.url),
);

const INFO = {
  openapi: "3.1.0",
  info: {
    title: "notemap",
    version: "1",
    description:
      "The capture-and-feed subset of notemap's /v1 surface. Binds to localhost by default; no authentication.",
  },
} as const;

/** Derived from the route definitions alone, so no pool is needed to describe them. */
export function openApiDocument(): object {
  const registry = new OpenAPIHono();
  for (const route of ROUTES) registry.openAPIRegistry.registerPath(route);
  return registry.getOpenAPI31Document(INFO);
}
