import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Swagger UI ships a dozen builds and their source maps. Two files render the
 * playground; copying only those keeps what the daemon serves to what it uses.
 */
export const SWAGGER_FILES = ["swagger-ui-bundle.js", "swagger-ui.css"];

const VENDOR_DIR = fileURLToPath(
  new URL("../public/vendor/swagger", import.meta.url),
);

export function vendorSwaggerUi(): void {
  const resolve = createRequire(import.meta.url).resolve;

  mkdirSync(VENDOR_DIR, { recursive: true });
  for (const file of SWAGGER_FILES) {
    copyFileSync(resolve(`swagger-ui-dist/${file}`), join(VENDOR_DIR, file));
  }
}
