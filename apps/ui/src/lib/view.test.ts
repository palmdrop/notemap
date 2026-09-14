import { expect, test } from "vitest";

import { remember, viewFor, withView } from "./view";

const at = (query = "") => new URL(`http://localhost/${query}`);

test("a list is a timeline until somebody asks for the index", () => {
  expect(viewFor("queue", at())).toBe("timeline");
  expect(viewFor("queue", at("?view=index"))).toBe("index");
});

test("remembers each surface on its own", () => {
  remember("queue", "index");

  expect(viewFor("queue", at())).toBe("index");
  expect(viewFor("feed", at())).toBe("timeline");
});

test("takes the URL over what was remembered, and falls through a view that is not one", () => {
  remember("queue", "index");

  expect(viewFor("queue", at("?view=timeline"))).toBe("timeline");
  expect(viewFor("queue", at("?view=sideways"))).toBe("index");
});

test("names the index on the URL and takes it off again for the timeline", () => {
  const url = withView(at("?order=newest-first"), "index");
  expect(url.searchParams.get("view")).toBe("index");
  expect(url.searchParams.get("order")).toBe("newest-first");

  expect(withView(url, "timeline").searchParams.has("view")).toBe(false);
});
