import { describe, expect, it, vi } from "vitest";

import { dispatch } from "./dispatch";
import type { Command } from "./command";

const chordFor = (id: string): string | undefined =>
  ({ discard: "D", route: "mod+enter", back: "escape" })[id];

function keydown(init: KeyboardEventInit, target?: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { ...init, cancelable: true });
  if (target !== undefined) {
    Object.defineProperty(event, "target", { value: target });
  }
  return event;
}

function run(id: string): Command {
  return { id, label: id, run: vi.fn() };
}

describe("resolving a chord against the stack", () => {
  it("takes the top-most layer's live command whose binding matches", () => {
    const bottom = [run("discard")];
    const top = [run("discard")];

    const found = dispatch(
      new KeyboardEvent("keydown", { key: "D" }),
      [() => bottom, () => top],
      chordFor,
    );

    expect(found).toBe(top[0]);
  });

  it("falls to a lower layer where the top has no live match", () => {
    const bottom = [run("discard")];
    const top: Command[] = [
      {
        id: "discard",
        label: "discard",
        refusal: "already discarded",
        run: vi.fn(),
      },
    ];

    const found = dispatch(
      new KeyboardEvent("keydown", { key: "D" }),
      [() => bottom, () => top],
      chordFor,
    );

    expect(found).toBe(bottom[0]);
  });

  it("answers nothing where no layer has a live match", () => {
    const found = dispatch(
      new KeyboardEvent("keydown", { key: "z" }),
      [() => [run("discard")]],
      chordFor,
    );

    expect(found).toBeUndefined();
  });
});

describe("the caret's own two rules", () => {
  it("does not fire a command while a field has the caret", () => {
    const input = document.createElement("input");
    const found = dispatch(
      keydown({ key: "D" }, input),
      [() => [run("discard")]],
      chordFor,
    );

    expect(found).toBeUndefined();
  });

  it("fires a command that says whileWriting, from a field", () => {
    const input = document.createElement("input");
    const route: Command = {
      id: "route",
      label: "route",
      whileWriting: true,
      run: vi.fn(),
    };

    const found = dispatch(
      keydown({ key: "Enter", metaKey: true }, input),
      [() => [route]],
      chordFor,
    );

    expect(found).toBe(route);
  });

  it("leaves the field on the first escape, reaching no command", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const event = keydown({ key: "Escape" }, input);
    const found = dispatch(
      event,
      [() => [{ id: "back", label: "back", run: vi.fn() }]],
      chordFor,
    );

    expect(found).toBeUndefined();
    expect(document.activeElement).not.toBe(input);
    expect(event.defaultPrevented).toBe(true);

    input.remove();
  });

  it("reaches the surface's own escape once the caret is no longer in a field", () => {
    const back: Command = { id: "back", label: "back", run: vi.fn() };

    const found = dispatch(
      keydown({ key: "Escape" }, document.body),
      [() => [back]],
      chordFor,
    );

    expect(found).toBe(back);
  });
});

describe("what already has the press", () => {
  it("leaves a key a control answered for alone", () => {
    const event = keydown({ key: "D" });
    event.preventDefault();

    expect(dispatch(event, [() => [run("discard")]], chordFor)).toBeUndefined();
  });

  it("leaves ⏎ to the control the browser is about to click", () => {
    const button = document.createElement("button");
    const select: Command = { id: "select", label: "select", run: vi.fn() };

    expect(
      dispatch(keydown({ key: "Enter" }, button), [() => [select]], (id) =>
        id === "select" ? "enter" : undefined,
      ),
    ).toBeUndefined();
  });
});
