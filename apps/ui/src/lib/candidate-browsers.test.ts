import type { Component } from "svelte";
import { describe, expect, it } from "vitest";

import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
import Option from "$components/primitives/composer/Option.svelte";

import { browserFor, type BrowserProps } from "./candidate-browsers";

/** Any component at all: what is under test is the lookup, not what it found. */
const bespoke = Option as unknown as Component<BrowserProps>;

describe("which control a destination kind's field draws through", () => {
  it("is the one registered for that kind", () => {
    expect(browserFor("kanban", { kanban: bespoke })).toBe(bespoke);
  });

  it("is the schema-driven browser for a kind that registered nothing", () => {
    expect(browserFor("filesystem", { kanban: bespoke })).toBe(
      CandidateBrowser,
    );
  });

  it("is the schema-driven browser for every kind, nothing being registered yet", () => {
    expect(browserFor("filesystem")).toBe(CandidateBrowser);
    expect(browserFor("kanban")).toBe(CandidateBrowser);
  });
});
