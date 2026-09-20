import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./create";

function capture(): { out: Writable; lines: () => string[] } {
  let said = "";
  const out = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      said += chunk.toString();
      done();
    },
  });
  return { out, lines: () => said.split("\n").filter((line) => line !== "") };
}

const CLOCK = /^\d\d:\d\d:\d\d\.\d\d\d /;

describe("the logger", () => {
  it("writes one text line per event, at or above its level", () => {
    const { out, lines } = capture();
    const logger = createLogger({ level: "info", format: "text" }, out);

    logger.debug("hidden");
    logger.info({ kind: "captured" }, "action");
    logger.warn({ kind: "delivery-failed" }, "action");
    logger.error("broke");

    const said = lines();
    expect(said).toHaveLength(3);
    expect(said[0]).toMatch(CLOCK);
    expect(said.map((line) => line.replace(CLOCK, ""))).toEqual([
      "INFO action kind=captured",
      "WARN action kind=delivery-failed",
      "ERROR broke",
    ]);
  });

  it("writes JSON with a named level and an ISO time, and no pid or host", () => {
    const { out, lines } = capture();
    const logger = createLogger({ level: "debug", format: "json" }, out);

    logger.debug({ method: "GET", status: 200 }, "request");

    const [line] = lines();
    const record = JSON.parse(line ?? "") as Record<string, unknown>;
    expect(record).toEqual({
      level: "debug",
      time: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/) as string,
      method: "GET",
      status: 200,
      msg: "request",
    });
  });

  it("puts an error's stack under the line", () => {
    const { out, lines } = capture();
    const logger = createLogger({ level: "info", format: "text" }, out);

    logger.error({ err: new Error("boom") }, "unexpected");

    const [head, stack] = lines();
    expect(head).toMatch(/ ERROR unexpected$/);
    expect(stack).toBe("  Error: boom");
  });

  it("never prints a field shaped like a secret", () => {
    const { out, lines } = capture();
    const logger = createLogger({ level: "info", format: "json" }, out);

    logger.info(
      {
        token: "tk_1234",
        headers: { authorization: "Bearer x", cookie: "s=1" },
        account: { password: "hunter2", secret: "s3" },
        name: "fine",
      },
      "leak",
    );

    const [line] = lines();
    expect(line).not.toMatch(/tk_1234|Bearer x|s=1|hunter2|s3"/);
    expect(line).toContain('"name":"fine"');
    expect(line).toContain("[redacted]");
  });
});
