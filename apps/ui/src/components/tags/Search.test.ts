import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import Search from "./Search.svelte";

afterEach(() => {
  vi.useRealTimers();
});

test("searches once the typing settles, pushing the first change and replacing the rest", async () => {
  vi.useFakeTimers();
  const searched: [string, boolean][] = [];
  render(Search, {
    words: "",
    onsearch: (words: string, push: boolean) => searched.push([words, push]),
  });
  const line = screen.getByRole("searchbox", { name: "search" });

  await fireEvent.input(line, { target: { value: "bi" } });
  await fireEvent.input(line, { target: { value: "bike" } });
  expect(searched).toEqual([]);

  await vi.advanceTimersByTimeAsync(250);
  expect(searched).toEqual([["bike", true]]);

  await fireEvent.input(line, { target: { value: "bike rack" } });
  await vi.advanceTimersByTimeAsync(250);
  expect(searched.at(-1)).toEqual(["bike rack", false]);

  // A new run of typing is somewhere new to go back from.
  await fireEvent.blur(line);
  await fireEvent.input(line, { target: { value: "shoe" } });
  await vi.advanceTimersByTimeAsync(250);
  expect(searched.at(-1)).toEqual(["shoe", true]);
});

test("follows the address when it moves under the line", async () => {
  const drawn = render(Search, { words: "bike", onsearch: () => undefined });
  const line = screen.getByRole("searchbox", { name: "search" });
  expect((line as HTMLInputElement).value).toBe("bike");

  await drawn.rerender({ words: "" });
  expect((line as HTMLInputElement).value).toBe("");
});

test("searches nothing once it is gone, though the typing had not settled", async () => {
  vi.useFakeTimers();
  const searched: string[] = [];
  const drawn = render(Search, {
    words: "",
    onsearch: (words: string) => searched.push(words),
  });

  await fireEvent.input(screen.getByRole("searchbox", { name: "search" }), {
    target: { value: "bike" },
  });
  drawn.unmount();
  await vi.advanceTimersByTimeAsync(250);

  expect(searched).toEqual([]);
});
