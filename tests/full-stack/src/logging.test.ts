import { describe, expect, it } from "vitest";

import {
  daemons,
  MANUAL,
  NAME,
  shutWorld,
  until,
  type Running,
} from "./harness/index.ts";

const daemon = daemons();

const lineSaying = (running: Running, pattern: RegExp) =>
  until(
    `the daemon to log ${pattern}`,
    async () => running.output().match(pattern)?.[0],
  );

const CLOCK = /\d\d:\d\d:\d\d\.\d\d\d/;

describe("what the daemon says on stdout", () => {
  it("announces itself as one levelled line per fact", async () => {
    const running = await daemon();

    const listening = await lineSaying(running, /^.* on http:\/\/\S+$/m);
    expect(listening).toMatch(new RegExp(`^${CLOCK.source} INFO `));
  });

  it("names each action the pool records, with the item and the agent", async () => {
    const running = await daemon();

    const captured = await running.client.capture({
      channel: MANUAL,
      text: "a capture the log should mention",
    });
    await running.client.drain();

    const line = await lineSaying(
      running,
      new RegExp(`INFO action kind=captured item=${captured.id} by=source .*`),
    );
    expect(line).not.toContain("a capture the log should mention");
  });

  it("warns about a sign-in it refused, without saying what was tried", async () => {
    const running = await daemon(await shutWorld({}));

    const refused = await fetch(`${running.url}/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: NAME, password: "not the password at all" }),
    });
    expect(refused.status).toBe(401);

    const line = await lineSaying(running, /WARN sign-in refused.*/);
    expect(line).not.toContain("not the password at all");
  });
});
