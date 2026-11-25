/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";

import { holdShare, SHARES } from "$lib/sharing/held";
import { answered, answerFor, SHARED_TO, WAITED } from "$lib/worker/answer";

const worker = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `notemap-shell-${version}`;

/** The page every route is drawn from: the daemon answers it for any path. */
const PAGE = "/";

const kept = new Set([PAGE, ...build, ...files]);

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll([...kept]);
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("notemap-shell-") && name !== SHELL) {
          await caches.delete(name);
        }
      }
      await worker.clients.claim();
    })(),
  );
});

async function fromKept(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  return (await cache.match(request)) ?? fetch(request);
}

async function page(request: Request): Promise<Response> {
  try {
    const response = await fetch(request, {
      signal: AbortSignal.timeout(WAITED),
    });
    if (answered(response)) return response;
  } catch {
    // Not answering is what the kept page is for.
  }
  const cache = await caches.open(SHELL);
  return (await cache.match(PAGE)) ?? Response.error();
}

async function share(request: Request): Promise<Response> {
  await holdShare(await request.formData(), await caches.open(SHARES));
  return Response.redirect(`${SHARED_TO}?shared`, 303);
}

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  const answer = answerFor(request, worker.location.origin, kept);

  if (answer === "kept") event.respondWith(fromKept(request));
  else if (answer === "shell") event.respondWith(page(request));
  else if (answer === "share") event.respondWith(share(request));
});
