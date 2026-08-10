import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../public/index.html", import.meta.url));

let cached: string | undefined;

export function capturePage(): string {
  cached ??= readFileSync(FILE, "utf8");
  return cached;
}
