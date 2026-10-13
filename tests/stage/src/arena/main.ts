import { readFileSync } from "node:fs";

import { startArenaServer } from "@notemap/destination-arena/testing";
import { readFixture } from "@notemap/seed";

import { channelsIn } from "./channels";

const port = Number(process.env["PORT"] ?? "8080");
const fixtures = process.env["FIXTURES"];

const server = await startArenaServer({
  port,
  host: "0.0.0.0",
  url: process.env["ARENA_URL"] ?? `http://127.0.0.1:${String(port)}`,
  ...(process.env["ARENA_TOKEN"] === undefined
    ? {}
    : { token: process.env["ARENA_TOKEN"] }),
});

if (fixtures !== undefined) {
  server.holds(
    channelsIn(readFixture(JSON.parse(readFileSync(fixtures, "utf8")))),
  );
}

console.log(`a fake are.na on ${String(port)}, reached as ${server.url}`);

// Nothing is held that outlives the process, so there is nothing to wait for.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => process.exit(0));
}
