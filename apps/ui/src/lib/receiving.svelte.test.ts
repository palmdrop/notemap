import { expect, test } from "vitest";

import { owner, receiver, receives, type Receiver } from "./receiving.svelte";

function named(name: string, edit: boolean): Receiver {
  return {
    name,
    edit,
    busy: () => false,
    owns: () => false,
    take: () => {},
  };
}

test("nothing receives until something says it does", () => {
  expect(receiver()).toBeUndefined();
});

test("an edit outranks the box, whichever was drawn first", () => {
  const edit = named("an edit", true);
  const box = named("the capture", false);
  const stops = [receives(edit), receives(box)];

  expect(receiver()).toBe(edit);

  stops[0]?.();
  expect(receiver()).toBe(box);

  stops[1]?.();
  expect(receiver()).toBeUndefined();
});

test("an edit outranks a box drawn after it", () => {
  const edit = named("an edit", true);
  const box = named("the capture", false);
  const stops = [receives(box), receives(edit)];

  expect(receiver()).toBe(edit);
  for (const stop of stops) stop();
});

test("a paste goes to whatever owns the field it lands in", () => {
  const field = document.createElement("textarea");
  const box = {
    ...named("the capture", false),
    owns: (target: EventTarget | null) => target === field,
  };
  const stops = [receives(box), receives(named("an edit", true))];

  expect(owner(field)).toBe(box);
  expect(owner(document.body)).toBeUndefined();
  for (const stop of stops) stop();
});

test("the latest of two boxes receives, as one page gives way to the next", () => {
  const leaving = named("the capture", false);
  const arriving = named("the capture", false);
  const stopLeaving = receives(leaving);
  const stopArriving = receives(arriving);

  expect(receiver()).toBe(arriving);

  stopLeaving();
  expect(receiver()).toBe(arriving);
  stopArriving();
});
