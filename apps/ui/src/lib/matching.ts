/**
 * What it means for a typed line to find a name, decided once: a tag, a
 * channel, a folder and a destination are narrowed the same way, and the way
 * changes here alone.
 *
 * Case is ignored. A name is matched at its head first and anywhere in it
 * second — the head being what somebody completing a name expects to see at
 * the top, and the middle being how a channel is found by a word in its title.
 */

export type Match = "prefix" | "within";

/** How this name answers what is being typed, or that it does not. */
export function match(name: string, typing: string): Match | undefined {
  const wanted = typing.toLowerCase();
  const held = name.toLowerCase();
  if (held.startsWith(wanted)) return "prefix";
  return held.includes(wanted) ? "within" : undefined;
}

/**
 * Everything that matches under any of its names, head matches ahead of the
 * rest and otherwise in the order given. Nothing typed narrows nothing.
 */
export function search<T>(
  items: readonly T[],
  typing: string,
  namesOf: (item: T) => readonly string[],
): readonly T[] {
  if (typing === "") return items;

  const atHead: T[] = [];
  const within: T[] = [];
  for (const item of items) {
    const found = namesOf(item).map((name) => match(name, typing));
    if (found.includes("prefix")) atHead.push(item);
    else if (found.includes("within")) within.push(item);
  }

  return [...atHead, ...within];
}
