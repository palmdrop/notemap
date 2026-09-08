import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { daemons, MANUAL, until, vaults } from "./harness/index.ts";

const daemon = daemons();

/**
 * The typed line reads two things off `/v1` per level: what the destination
 * offers, and what the pool remembers being routed there. Both cross every
 * layer — the schema the adapter declares, the route, the client's transport —
 * and neither is exercised by anything below this.
 */
describe("the two answers a typed place is completed from", () => {
  it("offers folders and notes together, and says what has been used", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    await mkdir(join(running.world.up, "notes"), { recursive: true });
    await writeFile(join(running.world.up, "notes", "by-hand.md"), "a note\n");

    const offered = await client.destinations.candidates(vault.up, {
      capability: "create-or-append",
      field: "path",
    });
    expect(offered).toMatchObject({ kind: "answered" });
    expect(
      offered.kind === "answered"
        ? offered.entries.map((each) => each.label)
        : [],
    ).toContain("notes");

    const inside = await client.destinations.candidates(vault.up, {
      capability: "create-or-append",
      field: "path",
      scope: "notes",
    });
    expect(inside.kind === "answered" ? inside.entries : []).toContainEqual({
      label: "by-hand.md",
      value: "notes/by-hand.md",
    });

    // Nothing has been routed with this capability, so the pool remembers none.
    expect(
      await client.destinations.remembered(vault.up, {
        capability: "create-or-append",
        field: "path",
      }),
    ).toEqual({ truncated: false, places: [] });

    const carried = await client.capture({
      channel: MANUAL,
      text: "one for the vault",
    });
    await client.drain();
    await client.routing.route(carried.id, {
      destination: vault.up,
      capability: "create-or-append",
      arguments: { path: "notes/by-hand.md" },
    });

    const remembered = await client.destinations.remembered(vault.up, {
      capability: "create-or-append",
      field: "path",
    });
    expect(remembered.places.map((each) => [each.value, each.uses])).toEqual([
      ["notes/by-hand.md", 1],
    ]);
  });

  /**
   * The whole reason the capability exists: the record says *put this here* and
   * the adapter decides against the vault as it finds it, so the same argument
   * set creates once and appends after.
   */
  it("creates a note that is not there and appends to one that is", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);
    const note = join(running.world.up, "journal", "monday.md");

    for (const said of ["the first thought", "the second thought"]) {
      const carried = await client.capture({ channel: MANUAL, text: said });
      await client.drain();
      await client.routing.route(carried.id, {
        destination: vault.up,
        capability: "create-or-append",
        arguments: { path: "journal/monday.md" },
      });
      await until(`${said} to land`, async () =>
        (await readFile(note, "utf8").catch(() => "")).includes(said)
          ? said
          : undefined,
      );
    }

    const written = await readFile(note, "utf8");
    expect(written).toContain("the first thought");
    expect(written).toContain("the second thought");
  });

  /** The pool answers this, so an unmountable destination has no bearing on it. */
  it("remembers a place on a destination that cannot be reached", async () => {
    const running = await daemon();
    const client = running.client;
    const vault = await vaults(running);

    const carried = await client.capture({
      channel: MANUAL,
      text: "one for the drive nobody mounted",
    });
    await client.drain();
    await client.routing.route(carried.id, {
      destination: vault.down,
      capability: "create-or-append",
      arguments: { path: "inbox/a-thought.md" },
    });

    const asked = await client.destinations.candidates(vault.down, {
      capability: "create-or-append",
      field: "path",
    });
    expect(asked.kind).not.toBe("answered");

    expect(
      (
        await client.destinations.remembered(vault.down, {
          capability: "create-or-append",
          field: "path",
        })
      ).places.map((each) => each.value),
    ).toEqual(["inbox/a-thought.md"]);
  });
});
