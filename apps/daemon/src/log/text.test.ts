import { describe, expect, it } from "vitest";

import { formatLine } from "./text";

const AT = "2026-09-20T15:10:50.068Z";

describe("a text line", () => {
  it("leads with the clock, the level and the message", () => {
    expect(formatLine({ time: AT, level: "info", msg: "listening" })).toBe(
      "15:10:50.068 INFO listening",
    );
  });

  it("carries every other field as key=value", () => {
    expect(
      formatLine({
        time: AT,
        level: "info",
        msg: "action",
        kind: "captured",
        subject: "0192",
        count: 3,
        ok: true,
      }),
    ).toBe(
      "15:10:50.068 INFO action kind=captured subject=0192 count=3 ok=true",
    );
  });

  it("flattens a nested object to dotted keys", () => {
    expect(
      formatLine({
        time: AT,
        level: "warn",
        msg: "action",
        detail: { record: "r1", destination: { name: "vault" } },
      }),
    ).toBe(
      "15:10:50.068 WARN action detail.record=r1 detail.destination.name=vault",
    );
  });

  it("quotes a value that holds whitespace, an equals sign or a quote", () => {
    expect(
      formatLine({
        time: AT,
        level: "info",
        path: "/v1/items",
        name: "my vault",
        odd: 'a="b"',
        empty: "",
      }),
    ).toBe(
      '15:10:50.068 INFO path=/v1/items name="my vault" odd="a=\\"b\\"" empty=""',
    );
  });

  it("prints an array and a null as JSON", () => {
    expect(
      formatLine({ time: AT, level: "info", tags: ["a", "b"], gone: null }),
    ).toBe('15:10:50.068 INFO tags=["a","b"] gone=null');
  });

  it("puts an error's stack on the lines below", () => {
    expect(
      formatLine({
        time: AT,
        level: "error",
        msg: "unexpected",
        method: "GET",
        err: {
          type: "Error",
          message: "boom",
          stack: "Error: boom\n    at somewhere (file.js:1:1)",
        },
      }),
    ).toBe(
      [
        "15:10:50.068 ERROR unexpected method=GET",
        "  Error: boom",
        "      at somewhere (file.js:1:1)",
      ].join("\n"),
    );
  });

  it("describes an error with no stack by its type and message", () => {
    expect(
      formatLine({
        time: AT,
        level: "error",
        err: { type: "Error", message: "boom" },
      }),
    ).toBe(["15:10:50.068 ERROR", "  Error: boom"].join("\n"));
  });

  it("survives a record with no time", () => {
    expect(formatLine({ level: "info", msg: "x" })).toBe("--:--:--.--- INFO x");
  });
});
