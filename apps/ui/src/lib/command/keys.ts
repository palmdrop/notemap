/** Whether the key was pressed in something a person is writing in. */
export function writing(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The chord a keydown is, normalised so a binding can name it once. A
 * printable character *is* the chord and shift is never named beside it —
 * `event.key` already reads `D` for a capital and `+` for the punctuation —
 * so only a named key lowercases and takes `mod` and `shift` as prefixes:
 * `enter`, `mod+enter`, `shift+tab`. `mod` is either physical key, which is
 * what lets the same chord match on every platform without asking which one
 * this is.
 */
export function chord(event: KeyboardEvent): string {
  const printable = event.key.length === 1;
  const name = printable ? event.key : event.key.toLowerCase();

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (!printable && event.shiftKey) parts.push("shift");
  parts.push(name);

  return parts.join("+");
}

/**
 * Whether the press is `mod+enter` inside a field: the one chord that commits
 * what a field holds from inside it, where `⏎` is a new line. Handled by the
 * field itself rather than published, so the field keeps the press.
 */
export function commits(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey
  );
}

/** Controls the browser clicks when the key lands on them, focused. */
const CLICKED = ["BUTTON", "A", "SUMMARY"];

/**
 * Whether the browser will turn this press into a click on whatever has the
 * focus. A control reached by tab answers for `⏎` and `space` itself, so a
 * command taking the same press would act twice, on two different things.
 */
export function activates(event: KeyboardEvent): boolean {
  if (event.key !== "Enter" && event.key !== " ") return false;

  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (CLICKED.includes(target.tagName) ||
      target.getAttribute("role") === "button")
  );
}
