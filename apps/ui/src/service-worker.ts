/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";

import { holdShare, SHARES } from "$lib/sharing/held";
import { answerFor } from "$lib/worker/answer";
import { page, PAGE, share, SHELL_PREFIX, stale } from "$lib/worker/respond";

const worker = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `${SHELL_PREFIX}${version}`;

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
      for (const name of stale(await caches.keys(), SHELL)) {
        await caches.delete(name);
      }
      await worker.clients.claim();
    })(),
  );
});

async function fromKept(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  return (await cache.match(request)) ?? fetch(request);
}

async function fromAnyKept(request: Request): Promise<Response> {
  return (await caches.match(request)) ?? fetch(request);
}

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  const answer = answerFor(request, worker.location.origin, kept);

  if (answer === "kept") event.respondWith(fromKept(request));
  else if (answer === "older") event.respondWith(fromAnyKept(request));
  else if (answer === "shell") {
    event.respondWith(page(request, () => caches.open(SHELL)));
  } else if (answer === "share") {
    event.respondWith(
      share(request, async (form) =>
        holdShare(form, await caches.open(SHARES)),
      ),
    );
  }
});
