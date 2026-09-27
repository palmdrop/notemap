import { describe, expect, it } from "vitest";

import { capturedLog } from "./testing";

const CLOCK = /^\d\d:\d\d:\d\d\.\d\d\d /;

describe("the logger", () => {
  it("writes one text line per event, at or above its level", () => {
    const {
      log: logger,
      said,
      lines,
    } = capturedLog({
      level: "info",
      format: "text",
    });

    logger.debug("hidden");
    logger.info({ kind: "captured" }, "action");
    logger.warn({ kind: "delivery-failed" }, "action");
    logger.error("broke");

    expect(said()).toMatch(CLOCK);
    expect(lines()).toEqual([
      "INFO action kind=captured",
      "WARN action kind=delivery-failed",
      "ERROR broke",
    ]);
  });

  it("writes JSON with a named level and an ISO time, and no pid or host", () => {
    const { log: logger, lines } = capturedLog({
      level: "debug",
      format: "json",
    });

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
    const { log: logger, said } = capturedLog({
      level: "info",
      format: "text",
    });
    const lines = () =>
      said()
        .split("\n")
        .filter((line) => line !== "");

    logger.error({ err: new Error("boom") }, "unexpected");

    const [head, stack] = lines();
    expect(head).toMatch(/ ERROR unexpected$/);
    expect(stack).toBe("  Error: boom");
  });

  it("never prints a field shaped like a secret", () => {
    const { log: logger, lines } = capturedLog({
      level: "info",
      format: "json",
    });

    logger.info(
      {
        token: "tk_1234",
        headers: { authorization: "Bearer x", cookie: "s=1" },
        account: { password: "hunter2", secret: "s3" },
        deeper: { account: { password: "hunter3" } },
        name: "fine",
      },
      "leak",
    );

    const [line] = lines();
    expect(line).not.toMatch(/tk_1234|Bearer x|s=1|hunter2|hunter3|s3"/);
    expect(line).toContain('"name":"fine"');
    expect(line).toContain("[redacted]");
  });
});
