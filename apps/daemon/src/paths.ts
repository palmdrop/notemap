import { fileURLToPath } from "node:url";

/**
 * Every module the bundler pulls in collapses into `dist/main.js`, so
 * `import.meta.url` is that file's — not the source file's. `src/` and `dist/`
 * are siblings, which makes this one path right both before and after
 * bundling, and makes it wrong from anywhere deeper. Resolve `public/` here.
 */
export const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
