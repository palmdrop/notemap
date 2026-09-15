import { activates, chord, writing } from "./keys";
import type { Command } from "./command";

/**
 * Resolves one keydown against however many layers are live, top-most last.
 * Three rules live here rather than in any command, none being about a deed:
 * whatever has the press already keeps it, a chord does not fire while a
 * field has the caret unless its command says `whileWriting`, and `esc` in a
 * field leaves the field instead of reaching anything.
 */
export function dispatch(
  event: KeyboardEvent,
  layers: readonly (() => readonly Command[])[],
  chordFor: (id: string) => string | undefined,
): Command | undefined {
  // A line that committed on `⏎`, a control the browser is about to click:
  // either has taken the press, and a command taking it too would act twice
  // on one of them.
  if (event.defaultPrevented || activates(event)) return undefined;

  const key = chord(event);
  const inField = writing(event.target);

  if (inField && key === "escape") {
    event.target.blur();
    event.preventDefault();
    return undefined;
  }

  for (let at = layers.length - 1; at >= 0; at -= 1) {
    const get = layers[at];
    if (get === undefined) continue;

    const found = get().find(
      (command) =>
        chordFor(command.id) === key &&
        command.refusal === undefined &&
        (!inField || command.whileWriting === true),
    );
    if (found === undefined) continue;

    event.preventDefault();
    return found;
  }

  return undefined;
}
