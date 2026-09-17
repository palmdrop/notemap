import { createFilesystemStore } from "../adapters/filesystem-store";
import { createFetchTransport } from "../adapters/fetch-transport";
import { createClient } from "../client";

/**
 * Creates a client, captures against a pool that is not there, and either
 * closes the client or leaves it open — then does nothing, so whether the
 * process ends is the client's doing. Run by the test beside it.
 */
const [directory, leaving] = process.argv.slice(2);

const client = createClient({
  transport: createFetchTransport("http://127.0.0.1:1"),
  store: createFilesystemStore(directory ?? ""),
});

await client.capture({ channel: "web", text: "made in a process that ends" });
await client.drain();
if (leaving !== "open") client.close();
