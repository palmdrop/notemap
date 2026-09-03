import { client } from "./client";

/**
 * A destination's name as it stands, for somewhere no component is reading. An
 * id says nothing a person can read, and one that was never loaded is unnamed
 * rather than shown.
 */
export function nameOf(id: string): string {
  return (
    client.destinations.held.find((one) => one.id === id)?.name ??
    "a destination"
  );
}
