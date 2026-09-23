import { Hono } from "hono";

import type { Pool } from "@notemap/core";

import { docsFileHandler } from "./docs/assets";
import { docsPage } from "./docs/page";
import { requireJsonBody } from "./middleware/content-type";
import { methodsFor, notFound } from "./middleware/not-found";
import { openApiDocument } from "./openapi";
import { actionsHandler } from "./routes/actions";
import {
  assetContentHandler,
  assetHandler,
  assetUploadHandler,
  type UploadLimits,
} from "./routes/assets";
import { archiveHandler, unarchiveHandler } from "./routes/archive";
import { captureHandler } from "./routes/captures";
import { editHandler } from "./routes/edit";
import {
  actionsRoute,
  archivedRoute,
  archiveRoute,
  assetContentRoute,
  accountKindsRoute,
  accountsRoute,
  assetRoute,
  assetUploadRoute,
  cancelDeliveryRoute,
  routingOutputRoute,
  captureRoute,
  createDestinationRoute,
  deleteDestinationRoute,
  destinationCandidatesRoute,
  destinationNamedRoute,
  destinationRememberedRoute,
  destinationDescriptionRoute,
  destinationKindsRoute,
  destinationProbeRoute,
  destinationsRoute,
  createTemplateRoute,
  deleteTemplateRoute,
  resolveTemplateRoute,
  templateReportRoute,
  templatesRoute,
  updateTemplateRoute,
  editRoute,
  feedRoute,
  endAllSessionsRoute,
  healthRoute,
  honoPath,
  loginRoute,
  logoutRoute,
  mintTokenRoute,
  putAccountRoute,
  removeAccountRoute,
  revokeTokenRoute,
  sessionRoute,
  tokensRoute,
  itemRoute,
  markProcessedRoute,
  queueRoute,
  retireDestinationRoute,
  previewRouteRoute,
  routeItemRoute,
  routingRecordsRoute,
  tagRoute,
  sourcesInUseRoute,
  tagsInUseRoute,
  unarchiveRoute,
  unretireDestinationRoute,
  untagRoute,
  updateDestinationRoute,
} from "./routes/definitions";
import {
  createDestinationHandler,
  deleteDestinationHandler,
  destinationCandidatesHandler,
  destinationNamedHandler,
  destinationRememberedHandler,
  destinationDescriptionHandler,
  destinationKindsHandler,
  destinationProbeHandler,
  destinationsHandler,
  retireDestinationHandler,
  updateDestinationHandler,
} from "./routes/destinations";
import {
  createTemplateHandler,
  deleteTemplateHandler,
  resolveTemplateHandler,
  templateReportHandler,
  templatesHandler,
  updateTemplateHandler,
} from "./routes/templates";
import { feedHandler } from "./routes/feed";
import { healthHandler } from "./routes/health";
import { itemHandler } from "./routes/items";
import { itemViewHandler } from "./routes/queue";
import { sourcesInUseHandler } from "./routes/sources";
import { tagHandler, tagsInUseHandler } from "./routes/tags";
import {
  cancelDeliveryHandler,
  markProcessedHandler,
  previewHandler,
  routeHandler,
  routingOutputHandler,
  routingRecordsHandler,
} from "./routes/routing";
import {
  endAllSessionsHandler,
  loginHandler,
  logoutHandler,
  sessionHandler,
} from "./routes/session";
import {
  mintTokenHandler,
  revokeTokenHandler,
  tokensHandler,
} from "./routes/tokens";
import { serveUi } from "./ui/serve";
import { json, refuse } from "./utils/responses";
import type { CookieOptions } from "./auth/sessions/config";
import type { Auth } from "./auth/types";
import type { AppEnv } from "./types";
import {
  authenticate,
  identify,
  requireSession,
} from "./middleware/authenticate";
import { except } from "hono/combine";
import { noticeOrigin } from "./middleware/origin";
import { logRequests } from "./middleware/request-log";
import type { Throttle } from "./auth/throttle";
import type { Accounts } from "./accounts";
import {
  accountKindsHandler,
  accountsHandler,
  putAccountHandler,
  removeAccountHandler,
} from "./routes/accounts";
import type { Logger } from "./log";

export type AppOptions = {
  readonly limits: UploadLimits;
  readonly auth: Auth;
  readonly accounts: Accounts;
  readonly cookies: CookieOptions;
  /** What `daemon.origin` said, for the notice when a request disagrees with it. */
  readonly origin?: string;
  readonly throttle: Throttle;
  readonly log: Logger;
};

export function createApp(pool: Pool, options: AppOptions): Hono<AppEnv> {
  const { auth, accounts, limits, log } = options;
  const app = new Hono<AppEnv>();

  app.use("*", logRequests(log));

  /**
   * `/v1/openapi.json` describes the routes and never the pool, and it is what
   * the playground reads; closing it would break a signed-out operator's only
   * way to look at the API without protecting anything the source does not
   * already say.
   */
  const OPEN_PATHS = ["/v1/health", "/v1/session", "/v1/openapi.json"];

  app.use("/v1/*", requireJsonBody);
  app.use(
    "/v1/*",
    except([...OPEN_PATHS], authenticate(auth, options.cookies)),
  );

  // Open, but they answer differently depending on who is asking, so they need
  // to know — and being signed out is an answer here rather than a refusal.
  app.use(honoPath(sessionRoute.path), identify(auth, options.cookies));
  app.use(honoPath(healthRoute.path), identify(auth, options.cookies));

  app.use(honoPath(tokensRoute.path), requireSession);
  app.use(`${honoPath(tokensRoute.path)}/*`, requireSession);
  app.use(honoPath(endAllSessionsRoute.path), requireSession);
  app.use(honoPath(accountKindsRoute.path), requireSession);
  app.use(honoPath(accountsRoute.path), requireSession);
  app.use(`${honoPath(accountsRoute.path)}/*`, requireSession);

  app.get(honoPath(healthRoute.path), healthHandler(pool, auth));

  app.use(honoPath(loginRoute.path), noticeOrigin(options.origin, log));

  app.post(
    honoPath(loginRoute.path),
    loginHandler(auth, options.cookies, options.throttle),
  );
  app.get(honoPath(sessionRoute.path), sessionHandler(auth));
  app.delete(honoPath(logoutRoute.path), logoutHandler(auth, options.cookies));
  app.delete(
    honoPath(endAllSessionsRoute.path),
    endAllSessionsHandler(auth, options.cookies),
  );

  app.get(honoPath(tokensRoute.path), tokensHandler(auth));
  app.post(honoPath(mintTokenRoute.path), mintTokenHandler(auth));
  app.delete(honoPath(revokeTokenRoute.path), revokeTokenHandler(auth));

  app.get(honoPath(accountKindsRoute.path), accountKindsHandler(accounts));
  app.get(honoPath(accountsRoute.path), accountsHandler(accounts));
  app.put(honoPath(putAccountRoute.path), putAccountHandler(accounts));
  app.delete(
    honoPath(removeAccountRoute.path),
    removeAccountHandler(accounts, pool),
  );

  app.post(honoPath(captureRoute.path), captureHandler(pool));
  app.get(honoPath(feedRoute.path), feedHandler(pool));
  app.get(honoPath(queueRoute.path), itemViewHandler(pool, "queue"));
  app.get(honoPath(archivedRoute.path), itemViewHandler(pool, "archived"));
  app.get(honoPath(itemRoute.path), itemHandler(pool));
  app.post(honoPath(archiveRoute.path), archiveHandler(pool));
  app.post(honoPath(unarchiveRoute.path), unarchiveHandler(pool));
  app.post(honoPath(tagRoute.path), tagHandler(pool, "tag"));
  app.post(honoPath(untagRoute.path), tagHandler(pool, "untag"));
  app.get(honoPath(tagsInUseRoute.path), tagsInUseHandler(pool));
  app.get(honoPath(sourcesInUseRoute.path), sourcesInUseHandler(pool));
  app.post(honoPath(editRoute.path), editHandler(pool));
  app.post(honoPath(markProcessedRoute.path), markProcessedHandler(pool));
  app.get(honoPath(routingRecordsRoute.path), routingRecordsHandler(pool));
  app.get(honoPath(templatesRoute.path), templatesHandler(pool));
  app.post(honoPath(createTemplateRoute.path), createTemplateHandler(pool));
  app.get(honoPath(templateReportRoute.path), templateReportHandler(pool));
  app.get(honoPath(resolveTemplateRoute.path), resolveTemplateHandler(pool));
  app.patch(honoPath(updateTemplateRoute.path), updateTemplateHandler(pool));
  app.delete(honoPath(deleteTemplateRoute.path), deleteTemplateHandler(pool));
  app.get(honoPath(destinationsRoute.path), destinationsHandler(pool));
  app.post(
    honoPath(createDestinationRoute.path),
    createDestinationHandler(pool),
  );
  app.get(honoPath(destinationKindsRoute.path), destinationKindsHandler(pool));
  app.get(
    honoPath(destinationDescriptionRoute.path),
    destinationDescriptionHandler(pool),
  );
  app.get(
    honoPath(destinationCandidatesRoute.path),
    destinationCandidatesHandler(pool),
  );
  app.get(honoPath(destinationNamedRoute.path), destinationNamedHandler(pool));
  app.get(honoPath(destinationProbeRoute.path), destinationProbeHandler(pool));

  app.get(
    honoPath(destinationRememberedRoute.path),
    destinationRememberedHandler(pool),
  );
  app.patch(
    honoPath(updateDestinationRoute.path),
    updateDestinationHandler(pool),
  );
  app.post(
    honoPath(retireDestinationRoute.path),
    retireDestinationHandler(pool, false),
  );
  app.post(
    honoPath(unretireDestinationRoute.path),
    retireDestinationHandler(pool, true),
  );
  app.delete(
    honoPath(deleteDestinationRoute.path),
    deleteDestinationHandler(pool),
  );
  app.post(honoPath(routeItemRoute.path), routeHandler(pool));
  app.post(honoPath(previewRouteRoute.path), previewHandler(pool));
  app.post(honoPath(cancelDeliveryRoute.path), cancelDeliveryHandler(pool));
  app.get(honoPath(routingOutputRoute.path), routingOutputHandler(pool));
  app.get(honoPath(actionsRoute.path), actionsHandler(pool));

  app.put(honoPath(assetUploadRoute.path), assetUploadHandler(pool, limits));
  app.get(honoPath(assetRoute.path), assetHandler(pool));
  app.get(honoPath(assetContentRoute.path), assetContentHandler(pool));

  app.get("/v1/openapi.json", () => json(openApiDocument(), 200));

  app.get("/docs", (context) =>
    context.html(docsPage(), 200, { "cache-control": "no-cache" }),
  );
  app.get("/docs/:file", docsFileHandler);

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

  app.notFound(serveUi(notFound(app)));

  // An unexpected throw is a bug. Answering it in the refusal grammar would
  // teach clients to trust a fiction.
  app.onError((error, context) => {
    log.error(
      { err: error, method: context.req.method, path: context.req.path },
      "a request threw",
    );
    return new Response(null, { status: 500 });
  });

  return app;
}
