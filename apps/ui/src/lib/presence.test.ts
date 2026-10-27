import { describe, expect, it } from "vitest";

import { askingToWithdraw } from "./presence";

describe("what withdrawing asks", () => {
  it("names the file still there, and claims nothing about what is in it", () => {
    expect(
      askingToWithdraw(
        { kind: "present", found: 1, of: 1 },
        "filesystem",
        "inbox/a-thought.md",
      ),
    ).toBe("The file a-thought.md is still there. Withdraw anyway?");
  });

  it("counts the blocks still in the channel", () => {
    expect(
      askingToWithdraw(
        { kind: "present", found: 3, of: 5 },
        "arena",
        "reading",
      ),
    ).toBe("3 of 5 blocks are still there. Withdraw anyway?");
  });

  it("says one block as the block", () => {
    expect(
      askingToWithdraw({ kind: "present", found: 1, of: 1 }, "arena", "1001"),
    ).toBe("The block is still there. Withdraw anyway?");
  });

  it("says a file that is gone is gone", () => {
    expect(
      askingToWithdraw({ kind: "absent" }, "webdav", "inbox/a-thought.md"),
    ).toBe("The file a-thought.md is not there any more. Withdraw?");
  });

  it("asks plainly where nothing could be said", () => {
    expect(askingToWithdraw({ kind: "unknown" }, "filesystem", "x.md")).toBe(
      "Withdraw?",
    );
    expect(askingToWithdraw(undefined, undefined, undefined)).toBe("Withdraw?");
  });
});
