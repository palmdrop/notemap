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

function mac(): boolean {
  return /mac/i.test(navigator.userAgent);
}

/** How a chord reads on the key a person would press, for a settings page or a palette. */
export function reads(chord: string): string {
  const onMac = mac();
  const named: Record<string, string> = {
    mod: onMac ? "⌘" : "Ctrl",
    alt: onMac ? "⌥" : "Alt",
    shift: "⇧",
    enter: "⏎",
    escape: "Esc",
    tab: "⇥",
    backspace: "⌫",
    delete: "⌦",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
  };

  return chord
    .split("+")
    .map((part) => named[part] ?? part)
    .join(onMac ? "" : "+");
}
