import { readFileSync } from "node:fs";

import openapiTS, { astToString } from "openapi-typescript";
import { describe, expect, it } from "vitest";

const GENERATED = new URL("./generated.d.ts", import.meta.url);
const DOCUMENT = new URL(
  "../../../../apps/daemon/openapi.json",
  import.meta.url,
);

/** The banner only the CLI writes, which is not the part that can go stale. */
function body(source: string): string {
  return source.slice(source.indexOf("export interface paths"));
}

describe("the generated API types", () => {
  it("match the document they are generated from", async () => {
    const regenerated = astToString(await openapiTS(DOCUMENT));

    // Regenerate with `pnpm --filter @notemap/client codegen` when this fails.
    expect(body(readFileSync(GENERATED, "utf8"))).toBe(body(regenerated));
  });
});
