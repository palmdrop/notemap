import { PassThrough, Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { askSecretly, readPassword, type Streams } from "./prompt";

/**
 * A terminal as far as the prompt is concerned, and a transcript of what it
 * drew. Two things make it faithful: the input is never ended, because a
 * terminal's stdin does not stop, and a line is typed only once a prompt has
 * asked for it — anything already buffered is read as a line nobody asked for.
 */
function terminal(typed: string[]): { streams: Streams; drawn: () => string } {
  const written: string[] = [];
  const waiting = [...typed];

  const input = Object.assign(new PassThrough(), { isTTY: true });

  const output = new Writable({
    write: (chunk: Buffer, _encoding, done) => {
      const text = chunk.toString("utf8");
      written.push(text);

      if (text.endsWith(": ")) {
        const next = waiting.shift();
        if (next !== undefined) setImmediate(() => input.write(next));
      }

      done();
    },
  });

  return { streams: { input, output }, drawn: () => written.join("") };
}

const piped = (text: string): Streams => ({
  input: Readable.from([text]),
  output: new Writable({ write: (_c, _e, done) => done() }),
});

describe("asking for a password at a terminal", () => {
  /** The whole point of the muted stream: a password must not survive on screen. */
  it("draws the prompt and never what was typed", async () => {
    const { streams, drawn } = terminal(["hunter2\n"]);

    const answer = await askSecretly("Password: ", streams);

    expect(answer).toBe("hunter2");
    expect(drawn()).toContain("Password: ");
    expect(drawn()).not.toContain("hunter2");
  });

  it("asks twice, and takes the answer when both agree", async () => {
    const { streams, drawn } = terminal(["hunter2\n", "hunter2\n"]);

    expect(await readPassword(streams)).toBe("hunter2");
    expect(drawn()).toContain("Confirm: ");
    expect(drawn()).not.toContain("did not match");
  });

  it("says so and asks again when they do not", async () => {
    const { streams, drawn } = terminal([
      "hunter2\n",
      "hunter3\n",
      "hunter2\n",
      "hunter2\n",
    ]);

    expect(await readPassword(streams)).toBe("hunter2");
    expect(drawn()).toContain("did not match");
  });

  it("gives up rather than asking forever", async () => {
    const { streams } = terminal(["a\n", "b\n", "a\n", "b\n", "a\n", "b\n"]);

    await expect(readPassword(streams)).rejects.toThrow(/not confirmed/);
  });
});

describe("taking a password from a pipe", () => {
  /** What a script does, and what `docker compose exec -T` does. */
  it("reads it, and does not ask to confirm what it cannot ask twice for", async () => {
    expect(await readPassword(piped("hunter2\n"))).toBe("hunter2");
  });

  it("drops only the newline the shell added", async () => {
    expect(await readPassword(piped("hunter2"))).toBe("hunter2");
    expect(await readPassword(piped("hunter2\r\n"))).toBe("hunter2");
    // A password may end in a space, and trimming would quietly change it.
    expect(await readPassword(piped("hunter2 \n"))).toBe("hunter2 ");
  });

  it("answers nothing for nothing, which the command refuses", async () => {
    expect(await readPassword(piped("\n"))).toBe("");
  });
});
