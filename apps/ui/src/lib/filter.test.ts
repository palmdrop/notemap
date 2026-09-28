import { describe, expect, it } from "vitest";

import { filtered, filterFor, placeKey, withFilter } from "./filter";

const at = (query: string) => new URL(`http://shell/feed${query}`);

describe("a filter on the address", () => {
  it("reads every tag, trimmed, once each, in order", () => {
    expect(filterFor(at("?tag=b&tag=%20a%20&tag=b&tag="))).toEqual(["b", "a"]);
  });

  it("is empty where no tag is named", () => {
    expect(filterFor(at("?view=index"))).toEqual([]);
  });

  it("writes the tags in place of the ones there, keeping the rest", () => {
    const url = withFilter(at("?view=index&tag=old"), ["kind/quote", "a"]);

    expect(url.searchParams.getAll("tag")).toEqual(["kind/quote", "a"]);
    expect(url.searchParams.get("view")).toBe("index");
    expect(withFilter(url, []).search).toBe("?view=index");
  });

  it("keeps a filtered reading's place apart from the whole surface's", () => {
    expect(placeKey("queue", [])).toBe("queue");
    expect(placeKey("queue", ["a"])).not.toBe(placeKey("queue", []));
    expect(placeKey("queue", ["a", "b"])).not.toBe(placeKey("queue", ["ab"]));
  });

  it("names the order and the view it is told, not the ones a stale address holds", () => {
    const url = filtered(
      at("?order=oldest-first&view=index"),
      ["a"],
      "timeline",
      "newest-first",
    );

    expect(url.searchParams.get("order")).toBe("newest-first");
    expect(url.searchParams.get("view")).toBeNull();
  });

  it("names no order where the address named none", () => {
    expect(filtered(at(""), ["a"], "index", "oldest-first").search).toBe(
      "?tag=a&view=index",
    );
  });
});
