import { expect, test, vi } from "vitest";

import { listCommands } from "./list";

test("wires the four commands straight to what the surface gave it", () => {
  const at = {
    ondown: vi.fn(),
    onup: vi.fn(),
    onselect: vi.fn(),
    ondeselect: vi.fn(),
  };
  const commands = listCommands(at);

  expect(commands.map((c) => c.id)).toEqual([
    "down",
    "up",
    "select",
    "deselect",
  ]);

  for (const command of commands) {
    if ("run" in command) void command.run();
  }

  expect(at.ondown).toHaveBeenCalledOnce();
  expect(at.onup).toHaveBeenCalledOnce();
  expect(at.onselect).toHaveBeenCalledOnce();
  expect(at.ondeselect).toHaveBeenCalledOnce();
});
