import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Action } from "#api/types";
import type { ActionsPage } from "../types";
import { watching, type Happened } from "./watching";

const EVERY = 10_000;

function anAction(id: string, at = "2026-09-03T10:00:00.000Z"): Action {
  return {
    id,
    kind: "delivery-failed",
    subject: "0198f0c2-item",
    by: { kind: "notemap" },
    at,
    detail: {},
  };
}

/** Newest first, which is the order the watcher reads in. */
function page(ids: readonly string[], more = false): ActionsPage {
  return {
    values: ids.map((id) => anAction(id)),
    ...(more ? { after: { at: "2026-09-03T09:00:00.000Z" } } : {}),
  };
}

function over(answers: readonly ActionsPage[]) {
  let at = 0;
  const heard: Happened[] = [];
  const held = watching(
    () => {
      const answer = answers[Math.min(at, answers.length - 1)];
      at += 1;
      return Promise.resolve(answer as ActionsPage);
    },
    { watched: true, answering: true, every: EVERY },
  );

  const listening = held.changes.subscribe((said) => heard.push(said));

  return {
    held,
    heard,
    asks: () => at,
    stop: () => {
      listening.unsubscribe();
      held.stop();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("watching what the pool has done", () => {
  /** Opening the shell by announcing yesterday is worse than saying nothing. */
  it("takes the first read as its mark and says nothing about it", async () => {
    const watcher = over([page(["three", "two", "one"])]);
    await vi.advanceTimersByTimeAsync(0);

    expect(watcher.heard).toEqual([]);
    watcher.stop();
  });

  it("answers only what happened after the mark, oldest first", async () => {
    const watcher = over([
      page(["one"]),
      page(["three", "two", "one"]),
      page(["three", "two", "one"]),
    ]);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(EVERY);
    expect(watcher.heard).toHaveLength(1);
    expect(watcher.heard[0]?.actions.map((action) => action.id)).toEqual([
      "two",
      "three",
    ]);
    expect(watcher.heard[0]?.more).toBe(false);

    // Nothing new since, and nothing said about it.
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(watcher.heard).toHaveLength(1);
    watcher.stop();
  });

  /** A page is what it can answer; a count and the log are what the rest is worth. */
  it("says when more happened than one read holds", async () => {
    const watcher = over([page(["one"]), page(["four", "three", "two"], true)]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(EVERY);

    expect(watcher.heard[0]?.more).toBe(true);
    expect(watcher.heard[0]?.actions).toHaveLength(3);
    watcher.stop();
  });

  it("asks nothing while nobody is reading, and asks at once on coming back", async () => {
    const watcher = over([page(["one"]), page(["two", "one"])]);
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.asks()).toBe(1);

    watcher.held.watched(false);
    await vi.advanceTimersByTimeAsync(EVERY * 5);
    expect(watcher.asks()).toBe(1);

    watcher.held.watched(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.asks()).toBe(2);
    watcher.stop();
  });

  it("asks nothing of a pool that is not answering, and catches up on its return", async () => {
    const watcher = over([page(["one"]), page(["two", "one"])]);
    await vi.advanceTimersByTimeAsync(0);

    watcher.held.answering(false);
    await vi.advanceTimersByTimeAsync(EVERY * 5);
    expect(watcher.asks()).toBe(1);

    watcher.held.answering(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.heard[0]?.actions.map((action) => action.id)).toEqual([
      "two",
    ]);
    watcher.stop();
  });

  /** Silence is not something to report: reachability is what a person reads. */
  it("says nothing when the read fails, and asks again on the next tick", async () => {
    let at = 0;
    const heard: Happened[] = [];
    const held = watching(
      () => {
        at += 1;
        return at === 2
          ? Promise.reject(new Error("nothing answered"))
          : Promise.resolve(page(at === 1 ? ["one"] : ["two", "one"]));
      },
      { watched: true, answering: true, every: EVERY },
    );
    held.changes.subscribe((said) => heard.push(said));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(heard).toEqual([]);

    await vi.advanceTimersByTimeAsync(EVERY);
    expect(heard[0]?.actions.map((action) => action.id)).toEqual(["two"]);
    held.stop();
  });

  it("stops asking once it is stopped", async () => {
    const watcher = over([page(["one"])]);
    await vi.advanceTimersByTimeAsync(0);

    watcher.stop();
    await vi.advanceTimersByTimeAsync(EVERY * 5);
    expect(watcher.asks()).toBe(1);
  });
});
