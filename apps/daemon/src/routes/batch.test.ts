import { afterEach, describe, expect, it } from "vitest";

import { MAX_BATCH } from "../constants";
import { captureMany, daemon, send, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function serving(): Daemon {
  const host = daemon(undefined, { vault: "ready" });
  open.push(host);
  return host;
}

const body = (response: Response) => response.json() as Promise<never>;

type Outcome = {
  id: string;
  outcome: string;
  record?: string;
  error?: { code: string };
};

type Answer = { batch: string; values: Outcome[] };

async function template(
  host: Daemon,
  triggerTag: string | null = "route/research",
): Promise<string> {
  const destination = await send(host.app, "/v1/destinations", {
    name: "Vault",
    kind: "filesystem",
    settings: { root: host.vaultRoot },
  });
  const made = await send(host.app, "/v1/templates", {
    name: "Research links",
    destination: ((await body(destination)) as { id: string }).id,
    capability: "create-or-append",
    arguments: { path: "research/{{captured_at}}.md" },
    ...(triggerTag === null ? {} : { triggerTag }),
  });
  if (made.status !== 201) throw new Error(await made.text());
  return ((await body(made)) as { id: string }).id;
}

const RESEARCH = "route/research";
const TAGGING = { kind: "tag", tag: RESEARCH };

async function batch(
  host: Daemon,
  items: readonly string[],
  action: Record<string, unknown>,
  id = "batch-1",
): Promise<Answer> {
  const response = await send(host.app, "/v1/batches", {
    batch: id,
    items,
    action,
  });
  expect(response.status).toBe(200);
  return body(response);
}

describe("a batch applying a template", () => {
  it("reserves each item and answers the record it holds", async () => {
    const host = serving();
    await template(host);
    const [first, second] = await captureMany(host.app, 2);

    const answer = await batch(host, [first!, second!], TAGGING);

    expect(answer.batch).toBe("batch-1");
    expect(answer.values.map((one) => [one.id, one.outcome])).toEqual([
      [first, "reserved"],
      [second, "reserved"],
    ]);
    for (const one of answer.values) expect(one.record).toEqual(any());
  });

  it("answers each item on its own, landing some and refusing others", async () => {
    const host = serving();
    await template(host);
    const [first] = await captureMany(host.app, 1);

    const answer = await batch(host, [first!, "nobody"], TAGGING);

    expect(answer.values).toMatchObject([
      { id: first, outcome: "reserved" },
      { id: "nobody", outcome: "refused", error: { code: "no-such-item" } },
    ]);
  });

  it("skips an item the template already filed", async () => {
    const host = serving();
    const id = await template(host);
    const [first] = await captureMany(host.app, 1);
    await send(host.app, `/v1/items/${first}/route`, { template: id });

    const answer = await batch(host, [first!], TAGGING);

    expect(answer.values).toMatchObject([{ id: first, outcome: "skipped" }]);
  });

  it("answers the same reservation when the batch is sent again", async () => {
    const host = serving();
    await template(host);
    const [first] = await captureMany(host.app, 1);
    const [once] = (await batch(host, [first!], TAGGING)).values;

    const [again] = (await batch(host, [first!], TAGGING)).values;

    expect(again).toMatchObject({ outcome: "reserved", record: once!.record });
  });

  it("writes the batch id on every entry it logs", async () => {
    const host = serving();
    await template(host);
    const [first] = await captureMany(host.app, 1);

    await batch(host, [first!], TAGGING, "batch-7");

    const log = (await body(
      await host.app.request(
        `/v1/actions?item=${first}&kind=tagged,template-fired`,
      ),
    )) as { values: { kind: string; batch?: string }[] };
    expect(log.values.map((one) => one.batch)).toEqual(["batch-7", "batch-7"]);
  });

  it("acts once on an item named twice", async () => {
    const host = serving();
    await template(host);
    const [first] = await captureMany(host.app, 1);

    const answer = await batch(host, [first!, first!], TAGGING);

    expect(answer.values).toHaveLength(1);
  });

  it("refuses a batch over the limit before touching anything", async () => {
    const host = serving();
    const items = Array.from({ length: MAX_BATCH + 1 }, (_, n) => `item-${n}`);

    const response = await send(host.app, "/v1/batches", {
      batch: "batch-1",
      items,
      action: { kind: "archive" },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "limit-too-large", max: MAX_BATCH },
    });
  });
});

describe("a batch tagging", () => {
  it("tags each item, and skips one that already carries the tag", async () => {
    const host = serving();
    const [first, second] = await captureMany(host.app, 2);
    await send(host.app, `/v1/items/${first}/tag`, { tag: "reading" });

    const answer = await batch(host, [first!, second!], {
      kind: "tag",
      tag: "reading",
    });

    expect(answer.values.map((one) => [one.id, one.outcome])).toEqual([
      [first, "skipped"],
      [second, "tagged"],
    ]);
  });

  it("takes a tag off each item that carries it", async () => {
    const host = serving();
    const [first, second] = await captureMany(host.app, 2);
    await send(host.app, `/v1/items/${first}/tag`, { tag: "reading" });

    const answer = await batch(host, [first!, second!], {
      kind: "untag",
      tag: "reading",
    });

    expect(answer.values.map((one) => [one.id, one.outcome])).toEqual([
      [first, "untagged"],
      [second, "skipped"],
    ]);
  });

  it("refuses taking off a trigger tag whose filing still stands", async () => {
    const host = serving();
    await template(host);
    const [first] = await captureMany(host.app, 1);
    await batch(host, [first!], TAGGING);

    const answer = await batch(
      host,
      [first!],
      { kind: "untag", tag: RESEARCH },
      "batch-2",
    );

    expect(answer.values).toMatchObject([
      { outcome: "refused", error: { code: "trigger-tag-held" } },
    ]);
  });
});

describe("a batch archiving", () => {
  it("archives each item with the reason given", async () => {
    const host = serving();
    const [first, second] = await captureMany(host.app, 2);

    const answer = await batch(host, [first!, second!], {
      kind: "archive",
      reason: "noise",
    });

    expect(answer.values).toMatchObject([
      {
        id: first,
        outcome: "archived",
        item: { archived: { reason: "noise" } },
      },
      { id: second, outcome: "archived" },
    ]);
  });

  it("unarchives, and skips an item that was not archived", async () => {
    const host = serving();
    const [first, second] = await captureMany(host.app, 2);
    await send(host.app, `/v1/items/${first}/archive`);

    const answer = await batch(host, [first!, second!], { kind: "unarchive" });

    expect(answer.values.map((one) => [one.id, one.outcome])).toEqual([
      [first, "unarchived"],
      [second, "skipped"],
    ]);
  });

  it("skips an item already archived rather than refusing it", async () => {
    const host = serving();
    const [first] = await captureMany(host.app, 1);
    await send(host.app, `/v1/items/${first}/archive`);

    const answer = await batch(host, [first!], { kind: "archive" });

    expect(answer.values).toMatchObject([{ id: first, outcome: "skipped" }]);
  });
});

describe("cancelling many deliveries", () => {
  it("cancels each record and gives every trigger tag back", async () => {
    const host = serving();
    await template(host);
    const [first, second] = await captureMany(host.app, 2);
    const records = (await batch(host, [first!, second!], TAGGING)).values
      .map((one) => one.record)
      .filter((record) => record !== undefined);

    const response = await send(host.app, "/v1/routing/cancel", { records });

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      values: records.map((record) => ({ record, outcome: "cancelled" })),
    });
    for (const item of [first, second]) {
      const read = (await body(
        await host.app.request(`/v1/items/${item}`),
      )) as { tags: unknown[] };
      expect(read.tags).toEqual([]);
    }
  });

  it("answers a record it could not cancel on its own", async () => {
    const host = serving();

    const response = await send(host.app, "/v1/routing/cancel", {
      records: ["nobody"],
    });

    expect(await body(response)).toMatchObject({
      values: [
        {
          record: "nobody",
          outcome: "refused",
          error: { code: "no-such-record" },
        },
      ],
    });
  });
});

function any() {
  return expect.any(String) as unknown;
}
