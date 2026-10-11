import type { Client } from "@notemap/client";

import { capturing, chosen, excerpt, landing } from "./note";

/** What the form holds when it is submitted. */
export type Values = {
  readonly text: string;
  readonly tags: readonly string[];
  readonly newTags: string;
  readonly files: readonly string[];
};

/**
 * Raycast's own part, as little of it as this needs: `failing` turns the toast
 * the form is showing into a failure and leaves the form as it is, `leaving`
 * says one line and leaves the form behind.
 */
export type Form = {
  readonly open: () => Client;
  readonly failing: (title: string, message: string) => void;
  readonly leaving: (said: string) => Promise<void>;
  /** Long enough for a pool that answers to answer, short enough not to hold the form. */
  readonly settleMs: number;
};

const whole = (landed: boolean | undefined, said: string) =>
  landed === true ? `Captured — ${said}` : `Waiting to send — ${said}`;

const partly = (said: string) => `Captured, but not all of it — ${said}`;

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * What the capture form does with what it was given: captures through a whole
 * client, so a note made while the daemon is unreachable waits in the outbox
 * for the drain command rather than being lost, and says which of the two
 * happened.
 *
 * The client is closed before anything that leaves the form: leaving ends this
 * process, so whatever is still on the wire has to be abandoned and written
 * back first rather than left leased.
 */
export async function submitting(form: Form, values: Values): Promise<void> {
  const said = excerpt(values.text);
  const client = form.open();
  let line: string | undefined;

  try {
    const captured = await capturing(client, {
      channel: "raycast",
      text: values.text,
      files: values.files,
      tags: chosen(values.tags, values.newTags),
    });

    if (captured.kind === "refused") {
      // Stays on the form, which still holds the words: leaving would take them
      // with it, and there is nothing captured to leave over.
      const { error } = captured;
      form.failing(
        "Nothing was captured",
        error instanceof Error ? error.message : said,
      );
      return;
    }

    // Whichever comes first: a pool that answered, or a wait worth no more of
    // the person's time. What is still waiting, the drain command sends.
    const landed =
      captured.kind === "partly"
        ? undefined
        : await Promise.race([
            landing(client),
            pause(form.settleMs).then(() => undefined),
          ]);

    line = captured.kind === "partly" ? partly(said) : whole(landed, said);
  } catch {
    // Past the capture the note is in the outbox and safe, so anything that
    // fails here is no longer a failure to capture.
    line = partly(said);
  } finally {
    await client.close();
  }

  if (line !== undefined) await form.leaving(line);
}
