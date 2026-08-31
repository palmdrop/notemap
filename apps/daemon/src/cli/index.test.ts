import { afterEach, describe, expect, it } from "vitest";

import { runCliCommand } from ".";
import { cleanup, said } from "./testing";

/** Set by `refuse`, and read by the entry point as the process's own. */
const exited = () => process.exitCode;

afterEach(() => {
  process.exitCode = undefined;
  cleanup();
});

const run = async (args: string[]) => {
  const heard = said();
  try {
    await runCliCommand(args);
  } finally {
    heard.restore();
  }
  return heard;
};

describe("finding the command", () => {
  it("answers `help` with the usage, and no failure", async () => {
    const heard = await run(["help"]);

    expect(heard.out.join("\n")).toContain("notemap token mint");
    expect(heard.err).toEqual([]);
    expect(exited()).toBeUndefined();
  });

  it("refuses a group it does not have, and says what it has", async () => {
    const heard = await run(["passwrd", "set"]);

    expect(heard.err.join("\n")).toContain("passwrd");
    expect(heard.err.join("\n")).toContain("notemap password set");
    expect(exited()).toBe(2);
  });

  /** A group named without an action is the likeliest typo, so it lists them. */
  it("names the actions a group has when none was given", async () => {
    const heard = await run(["token"]);

    expect(heard.err.join("\n")).toContain("mint, list, revoke");
    expect(exited()).toBe(2);
  });

  it("refuses an action the group does not have", async () => {
    const heard = await run(["token", "delete"]);

    expect(heard.err.join("\n")).toContain("delete");
    expect(heard.err.join("\n")).toContain("mint, list, revoke");
    expect(exited()).toBe(2);
  });

  /**
   * There is no user to manage, and a command called `user` would put the idea
   * back that the whole design leaves out.
   */
  it("has nothing called `user`", async () => {
    const heard = await run(["user", "add"]);

    expect(exited()).toBe(2);
    expect(heard.err.join("\n")).not.toContain("notemap user");
  });
});
