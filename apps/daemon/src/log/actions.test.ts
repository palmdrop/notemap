import { describe, expect, it } from "vitest";

import type { Action, ActionId, ItemId, Timestamp } from "@notemap/core";

import { actionLevel, logAction } from "./actions";
import { capturedLog } from "./testing";

const AT = "2026-09-20T15:10:50.068Z" as Timestamp;

const action = (partial: Partial<Action>): Action => ({
  id: "a1" as ActionId,
  kind: "captured",
  subject: "i1" as ItemId,
  by: { kind: "person" },
  at: AT,
  detail: {},
  ...partial,
});

describe("an action in the log", () => {
  it("is a warning where it says work went wrong, and information otherwise", () => {
    expect(actionLevel("delivery-failed")).toBe("warn");
    expect(actionLevel("work-failed")).toBe("warn");
    expect(actionLevel("work-abandoned")).toBe("warn");
    expect(actionLevel("captured")).toBe("info");
    expect(actionLevel("routed")).toBe("info");
  });

  it("is one line naming the kind, the item, the agent and the facts", () => {
    const { log, lines } = capturedLog();

    logAction(
      log,
      action({
        kind: "routed",
        detail: { record: "r1", destination: "d1", target: "destination" },
      }),
    );

    expect(lines()).toEqual([
      "INFO action kind=routed item=i1 by=person record=r1 destination=d1 target=destination",
    ]);
  });

  it("names a provider or a source beside the agent kind", () => {
    const { log, lines } = capturedLog();

    logAction(
      log,
      action({
        kind: "tagged",
        by: { kind: "source", source: "raycast" as never },
        detail: { tag: "kind/quote" },
      }),
    );

    expect(lines()[0]).toContain("by=source source=raycast tag=kind/quote");
  });

  it("leaves the item out where the action has none", () => {
    const { log, lines } = capturedLog();

    logAction(
      log,
      action({
        kind: "destination-created",
        subject: undefined as never,
        by: { kind: "person" },
        detail: { destination: "d1" },
      }),
    );

    expect(lines()[0]).toBe(
      "INFO action kind=destination-created by=person destination=d1",
    );
  });
});
