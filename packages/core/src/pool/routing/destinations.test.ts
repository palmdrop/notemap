import { describe, expect, it } from "vitest";

import { fakeDestination } from "../../testing/destination";
import type { DestinationId } from "../../types/domain/ids";

import { destinations, indexDestinations } from "./destinations";

describe("the destinations a pool is wired with", () => {
  it("answers what each one declares", async () => {
    const index = indexDestinations([
      fakeDestination({ id: "vault" as DestinationId }),
      fakeDestination({ id: "board" as DestinationId }),
    ]);

    expect((await destinations(index)).map((each) => each.id)).toEqual([
      "vault",
      "board",
    ]);
  });

  /** Whichever one a delivery reached would be arbitrary, so neither is wired. */
  it("refuses two answering to one name, while it can still be corrected", () => {
    expect(() =>
      indexDestinations([
        fakeDestination({ id: "vault" as DestinationId }),
        fakeDestination({ id: "vault" as DestinationId }),
      ]),
    ).toThrow(/two destinations are wired as vault/);
  });
});
