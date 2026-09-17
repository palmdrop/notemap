import type { Client } from "@notemap/client";

/** Drains, and answers how many operations are still waiting to be sent. */
export async function remaining(client: Client): Promise<number> {
  await client.drain();

  return new Promise<number>((resolve) => {
    client.waiting.subscribe((count) => resolve(count)).unsubscribe();
  });
}
