import { afterEach, expect, test, vi } from "vitest";

import { answer, leave, opened, question, unsaved } from "./leaving.svelte";

function anEdit(changed: boolean) {
  return {
    about: "the note",
    changed: () => changed,
    save: vi.fn(async () => true),
    revert: vi.fn(),
    resume: vi.fn(),
  };
}

let closing: (() => void) | undefined;
afterEach(() => closing?.());

/** The system's back gesture reaches here through the layout's `beforeNavigate`, as every way out does. */
test("leaving an edit with changes asks first, and keeping it stays", async () => {
  const edit = anEdit(true);
  closing = opened(edit);
  const then = vi.fn();

  expect(unsaved()).toBe(true);
  leave(then);
  expect(question.about).toBe(edit);
  expect(then).not.toHaveBeenCalled();

  await answer("stay");
  expect(then).not.toHaveBeenCalled();
  expect(edit.resume).toHaveBeenCalled();
});

test("losing the changes reverts them and goes on", async () => {
  const edit = anEdit(true);
  closing = opened(edit);
  const then = vi.fn();

  leave(then);
  await answer("revert");
  expect(edit.revert).toHaveBeenCalled();
  expect(then).toHaveBeenCalled();
});

test("an edit with nothing changed is left without asking", () => {
  closing = opened(anEdit(false));
  const then = vi.fn();

  leave(then);
  expect(then).toHaveBeenCalled();
  expect(question.about).toBeUndefined();
});
