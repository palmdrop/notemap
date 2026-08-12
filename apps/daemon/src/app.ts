import { Hono } from "hono";

import type { Pool } from "@notemap/core";

import { assetHandler } from "./docs/assets";
import { docsPage } from "./docs/page";
import { logPage } from "./log/page";
import { requireJsonBody } from "./middleware/content-type";
import { methodsFor, notFound } from "./middleware/not-found";
import { openApiDocument } from "./openapi";
import { capturePage } from "./page";
import { actionsHandler } from "./routes/actions";
import { captureHandler } from "./routes/captures";
import {
  actionsRoute,
  captureRoute,
  feedRoute,
  honoPath,
  itemRoute,
} from "./routes/definitions";
import { feedHandler } from "./routes/feed";
import { itemHandler } from "./routes/items";
import { json, refuse } from "./utils/responses";

export function createApp(pool: Pool): Hono {
  const app = new Hono();

  app.use("/v1/*", requireJsonBody);

  app.post(honoPath(captureRoute.path), captureHandler(pool));
  app.get(honoPath(feedRoute.path), feedHandler(pool));
  app.get(honoPath(itemRoute.path), itemHandler(pool));
  app.get(honoPath(actionsRoute.path), actionsHandler(pool));

  app.get("/v1/openapi.json", () => json(openApiDocument(), 200));

  app.get("/", (context) =>
    context.html(capturePage(), 200, { "cache-control": "no-cache" }),
  );

  app.get("/log", (context) =>
    context.html(logPage(), 200, { "cache-control": "no-cache" }),
  );

  app.get("/docs", (context) =>
    context.html(docsPage(), 200, { "cache-control": "no-cache" }),
  );
  app.get("/docs/:file", assetHandler);

  app.on("OPTIONS", "*", (context) => {
    const path = new URL(context.req.url).pathname;
    const allow = methodsFor(app, path);

    return allow.length === 0
      ? refuse({ kind: "unknown-route", path })
      : new Response(null, {
          status: 204,
          headers: { allow: allow.join(", ") },
        });
  });

  app.notFound(notFound(app));

  // An unexpected throw is a bug. Answering it in the refusal grammar would
  // teach clients to trust a fiction.
  app.onError((error) => {
    console.error(error);
    return new Response(null, { status: 500 });
  });

  return app;
}
