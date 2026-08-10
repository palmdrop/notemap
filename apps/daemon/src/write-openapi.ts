import { writeFileSync } from "node:fs";

import { openApiDocument, OPENAPI_FILE } from "./openapi";

writeFileSync(OPENAPI_FILE, `${JSON.stringify(openApiDocument(), null, 2)}\n`);
console.log(`wrote ${OPENAPI_FILE}`);
