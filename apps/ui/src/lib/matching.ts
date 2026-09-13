export type Match = "prefix" | "within";

export function match(name: string, typing: string): Match | undefined {
  const wanted = typing.toLowerCase();
  const held = name.toLowerCase();
  if (held.startsWith(wanted)) return "prefix";
  return held.includes(wanted) ? "within" : undefined;
}

/** Every match, those at the head of a name ahead of the rest and otherwise in the order given. */
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

/**
 * Only what begins with the line, which is what a completion can continue: a
 * name holding it in the middle has a head the person never typed.
 */
export function heads<T>(
  items: readonly T[],
  typing: string,
  namesOf: (item: T) => readonly string[],
): readonly T[] {
  return items.filter((item) =>
    namesOf(item).some((name) => match(name, typing) === "prefix"),
  );
}
