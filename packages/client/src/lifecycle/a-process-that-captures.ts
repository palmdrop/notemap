import { createServer } from "node:http";

import { createFilesystemStore } from "../adapters/filesystem-store";
import { createFetchTransport } from "../adapters/fetch-transport";
import { createClient } from "../client";

/**
 * Creates a client, captures against a pool that is not there, and either
 * closes the client or leaves it open — then does nothing, so whether the
 * process ends is the client's doing. Run by the test beside it.
 *
 * `stalling` is the pool that answers nothing rather than refusing: the drain
 * is abandoned rather than awaited, so at `close()` there is a request on the
 * wire with nothing to time it out.
 */
const [directory, mode] = process.argv.slice(2);

/** Unreferenced, so what holds the process open can only be the client. */
function accepting(): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(() => undefined);
    server.unref();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${String(port)}`);
    });
  });
}

const stalling = mode === "stalling";
const client = createClient({
  transport: createFetchTransport(
    stalling ? await accepting() : "http://127.0.0.1:1",
  ),
  store: createFilesystemStore(directory ?? ""),
});

await client.capture({ channel: "web", text: "made in a process that ends" });

if (stalling) {
  void client.drain();
  // Long enough for the request to reach the wire, so the close is the thing
  // under test rather than a race with it.
  await new Promise((resolve) => setTimeout(resolve, 250));
} else {
  await client.drain();
}

if (mode !== "open") client.close();
