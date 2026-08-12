import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PUBLIC_DIR } from "../paths";

const FILE = join(PUBLIC_DIR, "log.html");

let cached: string | undefined;

export function logPage(): string {
  cached ??= readFileSync(FILE, "utf8");
  return cached;
}
