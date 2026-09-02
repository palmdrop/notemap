import { describe, expect, it } from "vitest";

import { fakeDestinationRow } from "#testing/destination";
import type { DestinationKindAdapter } from "#types/api/ports";
import type { CandidatesAnswer } from "#types/domain/destination";
import type { CapabilityName, DestinationKindName } from "#types/domain/ids";

import { NotOffered } from "./candidates";
import { destinationRegistry } from "./registry";

const FILESYSTEM = "filesystem" as DestinationKindName;

const answer: CandidatesAnswer = {
  entries: [{ label: "Inbox", value: "inbox" }],
  truncated: false,
};

function adapter(
  offering: { candidates?: boolean; probe?: boolean } = {},
): DestinationKindAdapter {
  return {
    name: FILESYSTEM,
    settingsSchema: { type: "object" },
    describe: () => Promise.resolve({ capabilities: [] }),
    deliver: () => Promise.resolve({ kind: "delivered" }),
    ...(offering.candidates === true
      ? { candidates: () => Promise.resolve(answer) }
      : {}),
    ...(offering.probe === true ? { probe: () => Promise.resolve() } : {}),
  };
}

describe("the registry's candidates dispatch", () => {
  it("forwards to the adapter's own candidates where it has one", async () => {
    const destinations = destinationRegistry([adapter({ candidates: true })]);
    const vault = fakeDestinationRow({ kind: FILESYSTEM });

    await expect(
      destinations.candidates(vault, {
        capability: "create-note" as CapabilityName,
        field: "directory",
      }),
    ).resolves.toEqual(answer);
  });

  it("rejects with NotOffered where the registered adapter has none", async () => {
    const destinations = destinationRegistry([adapter()]);
    const vault = fakeDestinationRow({ kind: FILESYSTEM });

    await expect(
      destinations.candidates(vault, {
        capability: "create-note" as CapabilityName,
        field: "directory",
      }),
    ).rejects.toThrow(NotOffered);
  });
});

describe("the registry's probe dispatch", () => {
  it("forwards to the adapter's own probe where it has one", async () => {
    const destinations = destinationRegistry([adapter({ probe: true })]);

    await expect(
      destinations.probe(fakeDestinationRow({ kind: FILESYSTEM })),
    ).resolves.toBeUndefined();
  });

  /** One fact to a caller: nothing here can be asked, however that came about. */
  it("rejects with NotOffered where the registered adapter has none", async () => {
    const destinations = destinationRegistry([adapter()]);

    await expect(
      destinations.probe(fakeDestinationRow({ kind: FILESYSTEM })),
    ).rejects.toThrow(NotOffered);
  });
});
