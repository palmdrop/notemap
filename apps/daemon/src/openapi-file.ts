import { fileURLToPath } from "node:url";

/**
 * The generated document, checked in: a route change that changes the contract
 * shows up in the diff of the change that caused it. `pnpm --filter
 * @notemap/daemon openapi` rewrites it, and a test fails when it is stale.
 */
export const OPENAPI_FILE = fileURLToPath(
  new URL("../openapi.json", import.meta.url),
);
