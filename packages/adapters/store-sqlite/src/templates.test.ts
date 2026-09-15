import type { DestinationId, RoutingTemplateId, TagName } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import type { SqlitePoolStore } from "./pool-store";
import {
  at,
  capture,
  destination,
  putDestinations,
  putTemplates,
  reserved,
  store,
  template,
  VAULT,
} from "./testing/fixture";

const opened: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of opened.splice(0)) await cleanup();
});

function pool(): { pool: SqlitePoolStore } {
  const created = store();
  opened.push(created.cleanup);
  return created;
}

describe("the routing templates a pool holds", () => {
  it("reads back what was written, oldest first", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(
      p,
      template({ id: "tpl-daily", createdAt: "2026-09-04T08:00:00.000Z" }),
      template(),
    );

    expect((await p.routingTemplates()).map((each) => each.id)).toEqual([
      "tpl-daily",
      "tpl-research",
    ]);
    expect(
      await p.routingTemplate("tpl-research" as RoutingTemplateId),
    ).toEqual({
      ...template(),
      modifiedAt: expect.any(String),
      fired: { records: 0 },
    });
  });

  it("counts what was routed from it, and when the last of it was", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template());
    const item = capture();

    await p.transaction(async (tx) => {
      await tx.insertItem(item);
      await tx.insertRoutingRecord({
        ...reserved(item),
        at: at("2026-09-05T10:00:00.000Z"),
        applied: {
          template: "tpl-research" as RoutingTemplateId,
          firedByTag: true,
        },
      });
    });

    expect(
      (await p.routingTemplate("tpl-research" as RoutingTemplateId))?.fired,
    ).toEqual({ records: 1, lastAt: at("2026-09-05T10:00:00.000Z") });
  });

  it("carries the patterns as written, and expands nothing", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template());

    const held = await p.routingTemplate("tpl-research" as RoutingTemplateId);

    expect(held?.arguments).toEqual({ path: "research/{{captured_at}}.md" });
  });

  it("answers a trigger tag with the one template that claims it", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template({ triggerTag: "route/research" }));

    expect(
      await p.routingTemplateByTriggerTag("route/research" as TagName),
    ).toMatchObject({ id: "tpl-research" });
    expect(await p.routingTemplateByTriggerTag("route/daily" as TagName)).toBe(
      undefined,
    );
  });

  it("refuses a second template claiming one trigger tag", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template({ triggerTag: "route/research" }));

    await expect(
      putTemplates(
        p,
        template({ id: "tpl-other", triggerTag: "route/research" }),
      ),
    ).rejects.toThrow();
  });

  it("lets many templates carry no trigger tag at all", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());

    await putTemplates(p, template(), template({ id: "tpl-daily" }));

    expect(await p.routingTemplates()).toHaveLength(2);
  });

  it("does not stand in the way of deleting the destination it names", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template());

    await p.transaction((tx) => tx.deleteDestination(VAULT));

    expect(
      (await p.routingTemplate("tpl-research" as RoutingTemplateId))
        ?.destination,
    ).toBe(VAULT);
    expect(await p.destination(VAULT)).toBeUndefined();
  });

  it("says which templates a destination's deletion would strand", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination(), destination({ id: "board" }));
    await putTemplates(
      p,
      template(),
      template({ id: "tpl-board", destination: "board" }),
    );

    expect(
      (await p.routingTemplatesNaming(VAULT)).map((each) => each.id),
    ).toEqual(["tpl-research"]);
  });

  it("keeps the establishment it was written with", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(
      p,
      template({
        folder: "establish",
        establishedAt: "2026-08-21T09:00:00.000Z",
      }),
    );

    expect(
      await p.routingTemplate("tpl-research" as RoutingTemplateId),
    ).toMatchObject({
      folder: "establish",
      establishedAt: at("2026-08-21T09:00:00.000Z"),
    });
  });

  it("edits every field a person may change in one write", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination(), destination({ id: "board" }));
    await putTemplates(p, template({ triggerTag: "route/research" }));

    await p.transaction((tx) =>
      tx.updateRoutingTemplate({
        ...template({ destination: "board" }),
        name: "Research",
      }),
    );

    const edited = await p.routingTemplate("tpl-research" as RoutingTemplateId);
    expect(edited).toMatchObject({
      name: "Research",
      destination: "board" as DestinationId,
    });
    expect(edited?.triggerTag).toBeUndefined();
  });

  it("deletes without asking what named it", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template());

    await p.transaction((tx) =>
      tx.deleteRoutingTemplate("tpl-research" as RoutingTemplateId),
    );

    expect(await p.routingTemplates()).toEqual([]);
  });
});

describe("a record made from a template", () => {
  it("names the template and says the tag applied it", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template());
    const item = capture();

    await p.transaction(async (tx) => {
      await tx.insertItem(item);
      await tx.insertRoutingRecord({
        ...reserved(item),
        applied: {
          template: "tpl-research" as RoutingTemplateId,
          firedByTag: true,
        },
      });
    });

    expect((await p.routingRecords(item.id))[0]).toMatchObject({
      applied: { template: "tpl-research", firedByTag: true },
    });
    expect((await p.item(item.id))?.routing?.templates).toEqual([
      "tpl-research",
    ]);
  });

  it("keeps naming a template that has since been deleted", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    await putTemplates(p, template());
    const item = capture();

    await p.transaction(async (tx) => {
      await tx.insertItem(item);
      await tx.insertRoutingRecord({
        ...reserved(item),
        applied: {
          template: "tpl-research" as RoutingTemplateId,
          firedByTag: false,
        },
      });
      await tx.deleteRoutingTemplate("tpl-research" as RoutingTemplateId);
    });

    expect((await p.routingRecords(item.id))[0]).toMatchObject({
      applied: { template: "tpl-research", firedByTag: false },
    });
  });

  it("says nothing where the decision was made by hand", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());
    const item = capture();

    await p.transaction(async (tx) => {
      await tx.insertItem(item);
      await tx.insertRoutingRecord(reserved(item));
    });

    expect((await p.routingRecords(item.id))[0]?.applied).toBeUndefined();
  });
});
