import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { daemons, MANUAL, vaults } from "./harness/index.ts";

const daemon = daemons();

/**
 * What went and what would go cross every layer there is: the adapter's
 * conversion, core's blob, the store's columns, two routes and the client's
 * transport. Nothing below this exercises the pair end to end.
 */
describe("what a delivery produced, and what one would", () => {
  it("answers a preview that matches the note the delivery then writes", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    const item = await client.capture({
      channel: MANUAL,
      text: "one for the vault",
    });
    await client.drain();

    const request = {
      destination: vault.up,
      capability: "create-file",
      arguments: { directory: "inbox", filename: "a-thought.md" },
    };

    const shown = await client.routing.preview(item.id, request);
    if (shown.kind !== "previewed") {
      throw new Error(`nothing shown: ${shown.kind}`);
    }
    expect(shown.content?.mediaType).toBe("text/markdown");
    expect(shown.content?.text).toContain("one for the vault");
    // Asking wrote nothing and decided nothing.
    expect(await client.routing.recordsFor(item.id)).toEqual([]);

    const record = await client.routing.route(item.id, request);
    expect(record.state).toBe("delivered");
    expect(record.output?.content?.mediaType).toBe("text/markdown");

    const sent = await client.routing.output(record.id);
    expect(sent).toBe(shown.content?.text);
    expect(
      await readFile(join(running.world.up, record.pointer ?? ""), "utf8"),
    ).toBe(sent);
  });

  it("says a preview of a vault that is not there, and routes to it anyway", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    const item = await client.capture({ channel: MANUAL, text: "later" });
    await client.drain();

    const request = {
      destination: vault.down,
      capability: "create-file",
      arguments: { directory: "inbox", filename: "later.md" },
    };

    expect(await client.routing.preview(item.id, request)).toMatchObject({
      kind: "unreachable",
    });

    // The seeing failed; the deciding did not.
    const record = await client.routing.route(item.id, request);
    expect(record.state).toBe("pending");
    expect(record.output).toBeUndefined();
  });
});
