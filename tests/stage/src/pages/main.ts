import { startPageServer } from "./server";

const port = Number(process.env["PORT"] ?? "8080");
const image = process.env["PAGES_IMAGE_URL"];

await startPageServer({
  port,
  host: "0.0.0.0",
  ...(image === undefined ? {} : { image }),
});

console.log(`a placeholder page on every path, on ${String(port)}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => process.exit(0));
}
