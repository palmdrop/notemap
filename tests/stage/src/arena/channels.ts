import type { ChannelRow } from "@notemap/destination-arena/testing";
import type { Fixture } from "@notemap/seed";

const ARENA = "arena";

/** Every channel a fixture's are.na templates name, so browsing offers them. */
export function channelsIn(fixture: Fixture): readonly ChannelRow[] {
  const arena = new Set(
    fixture.destinations
      .filter((each) => each.kind === ARENA)
      .map((each) => each.name),
  );

  const slugs = fixture.templates.flatMap((each) => {
    const channel = each.arguments["channel"];
    return arena.has(each.destination) && typeof channel === "string"
      ? [channel]
      : [];
  });

  return [...new Set(slugs)].map((slug) => ({ slug, title: slug }));
}
