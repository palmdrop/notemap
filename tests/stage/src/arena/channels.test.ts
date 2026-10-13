import { readFixture } from "@notemap/seed";
import { describe, expect, it } from "vitest";

import { channelsIn } from "./channels";

const template = (destination: string, channel: string) => ({
  name: `${destination} ${channel}`,
  destination,
  capability: "create",
  arguments: { channel },
  triggerTag: `route/${channel}`,
});

describe("the channels a fixture names", () => {
  it("are the are.na templates' channels, once each", () => {
    const fixture = readFixture({
      destinations: [
        { name: "Board", kind: "arena", settings: { account: "arena" } },
        { name: "Vault", kind: "filesystem", settings: { root: "/v" } },
      ],
      templates: [
        template("Board", "seeded"),
        template("Board", "seeded"),
        template("Board", "later"),
        template("Vault", "not-a-channel"),
      ],
    });

    expect(channelsIn(fixture)).toEqual([
      { slug: "seeded", title: "seeded" },
      { slug: "later", title: "later" },
    ]);
  });
});
