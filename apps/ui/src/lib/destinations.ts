import { client } from "./client";

/**
 * A destination's name as it stands, for somewhere no component is reading. An
 * id says nothing a person can read, and one that was never loaded is unnamed
 * rather than shown.
 */
export function nameOf(id: string): string {
  let name = "a destination";

  const held = client.destinations.all.subscribe((all) => {
    name = all.find((one) => one.id === id)?.name ?? name;
  });
  held.unsubscribe();

  return name;
}
