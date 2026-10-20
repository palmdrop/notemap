import type { Client, RoutingTemplate } from "@notemap/client";
import { describe, expect, it } from "vitest";

import { askedFor, fieldId, suppliedFrom } from "./asked";

const TODO = {
  id: "tpl-1",
  name: "todo",
  destination: "vault",
  capability: "append",
  arguments: { path: "todo.md", heading: "Inbox" },
  asked: { heading: { label: "list" }, conversion: {} },
  folder: "create",
  triggerTag: "route/todo",
  fired: { records: 0 },
} as unknown as RoutingTemplate;

const APPEND = {
  name: "append",
  accepts: ["note"],
  argumentsSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        "x-notemap-path": true,
        "x-notemap-candidates": true,
      },
      conversion: { type: "string", title: "as", enum: ["block", "task"] },
      heading: {
        type: "string",
        title: "under",
        "x-notemap-candidates": true,
        "x-notemap-candidates-given": ["path"],
      },
    },
  },
};

function answering(asked: unknown[] = []): Client {
  return {
    destinations: {
      describe: () =>
        Promise.resolve({ kind: "described", capabilities: [APPEND] }),
      candidates: (_id: string, request: unknown) => {
        asked.push(request);
        return Promise.resolve({
          kind: "answered",
          entries: [
            { label: "## Next", value: "Next" },
            { label: "archive", scope: "archive" },
          ],
          truncated: false,
        });
      },
    },
  } as unknown as Client;
}

describe("what a chosen trigger tag's template asks", () => {
  it("is each asked field in the order the capability declares them", async () => {
    const fields = await askedFor(answering(), "route/todo", TODO);

    expect(fields.map((one) => one.field)).toEqual(["conversion", "heading"]);
  });

  it("offers a fixed field's set, under the schema's title", async () => {
    const [conversion] = await askedFor(answering(), "route/todo", TODO);

    expect(conversion).toMatchObject({
      label: "as",
      closed: ["block", "task"],
    });
  });

  it("lists what the destination holds, asked with the template's own note", async () => {
    const asked: unknown[] = [];
    const [, heading] = await askedFor(answering(asked), "route/todo", TODO);

    expect(heading).toMatchObject({
      label: "list",
      default: "Inbox",
      listed: [{ label: "## Next", value: "Next" }],
    });
    expect(asked).toEqual([
      { capability: "append", field: "heading", given: { path: "todo.md" } },
    ]);
  });

  it("lists no entry that is only somewhere to look further", async () => {
    const [, heading] = await askedFor(answering(), "route/todo", TODO);

    expect(heading?.listed).toEqual([{ label: "## Next", value: "Next" }]);
  });

  it("leaves an asked place typed rather than listed a level deep", async () => {
    const asked: unknown[] = [];
    const [path] = await askedFor(answering(asked), "route/todo", {
      ...TODO,
      asked: { path: {} },
    } as RoutingTemplate);

    expect(path?.field).toBe("path");
    expect(path?.listed).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("lists nothing where the note it depends on is a pattern", async () => {
    const asked: unknown[] = [];
    const [, heading] = await askedFor(answering(asked), "route/todo", {
      ...TODO,
      arguments: { path: "todo/{{captured_at:month}}.md" },
    } as RoutingTemplate);

    expect(heading).not.toHaveProperty("listed");
    expect(asked).toEqual([]);
  });

  it("leaves every field typed where the destination cannot say what they are", async () => {
    const client = {
      destinations: {
        describe: () => Promise.reject(new Error("asleep")),
      },
    } as unknown as Client;

    const fields = await askedFor(client, "route/todo", TODO);

    expect(fields).toEqual([
      { tag: "route/todo", field: "heading", label: "list", default: "Inbox" },
      { tag: "route/todo", field: "conversion", label: "conversion" },
    ]);
  });
});

describe("what the form gave for them", () => {
  it("is by tag and field, for the tags still chosen and the fields given anything", () => {
    expect(
      suppliedFrom(
        {
          text: "milk",
          [fieldId("route/todo", "heading")]: " Next ",
          [fieldId("route/todo", "conversion")]: "",
          [fieldId("route/gone", "heading")]: "Next",
        },
        ["route/todo"],
      ),
    ).toEqual({ "route/todo": { heading: "Next" } });
  });
});
