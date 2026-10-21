import { describe, expect, it } from "vitest";

import { filterOf, WHOLE } from "@notemap/client";

import { filtered, filterFor, placeKey, toggled, withFilter } from "./filter";

const at = (query: string) => new URL(`http://shell/feed${query}`);
const tags = (...names: string[]) => filterOf({ tags: names });

describe("a filter on the address", () => {
  it("reads every tag, trimmed, once each, in order", () => {
    expect(filterFor(at("?tag=b&tag=%20a%20&tag=b&tag=")).tags).toEqual([
      "b",
      "a",
    ]);
  });

  it("reads states, destinations and sources beside the tags", () => {
    expect(
      filterFor(
        at("?state=routed&state=archived&state=bogus&destination=v&source=m"),
      ),
    ).toEqual({
      tags: [],
      states: ["routed", "archived"],
      destinations: ["v"],
      sources: ["m"],
    });
  });

  it("is whole where nothing is named", () => {
    expect(filterFor(at("?view=index"))).toEqual(WHOLE);
  });

  it("writes the filter in place of the one there, keeping the rest", () => {
    const url = withFilter(
      at("?view=index&tag=old&state=revised"),
      filterOf({ tags: ["kind/quote", "a"], states: ["routed"] }),
    );

    expect(url.searchParams.getAll("tag")).toEqual(["kind/quote", "a"]);
    expect(url.searchParams.getAll("state")).toEqual(["routed"]);
    expect(url.searchParams.get("view")).toBe("index");
    expect(withFilter(url, WHOLE).search).toBe("?view=index");
  });

  it("takes a value into its kind and out again", () => {
    const one = toggled(WHOLE, "states", "routed");
    expect(one.states).toEqual(["routed"]);
    expect(toggled(one, "states", "routed")).toEqual(WHOLE);
    expect(toggled(one, "sources", "memos").sources).toEqual(["memos"]);
  });

  it("keeps a filtered reading's place apart from the whole surface's", () => {
    expect(placeKey("queue", WHOLE)).toBe("queue");
    expect(placeKey("queue", tags("a"))).not.toBe(placeKey("queue", WHOLE));
    expect(placeKey("queue", tags("a", "b"))).not.toBe(
      placeKey("queue", tags("ab")),
    );
    expect(placeKey("feed", tags("routed"))).not.toBe(
      placeKey("feed", filterOf({ states: ["routed"] })),
    );
  });

  it("names the order and the view it is told, not the ones a stale address holds", () => {
    const url = filtered(
      at("?order=oldest-first&view=index"),
      tags("a"),
      "timeline",
      "newest-first",
    );

    expect(url.searchParams.get("order")).toBe("newest-first");
    expect(url.searchParams.get("view")).toBeNull();
  });

  it("names no order where the address named none", () => {
    expect(filtered(at(""), tags("a"), "index", "oldest-first").search).toBe(
      "?tag=a&view=index",
    );
  });
});
