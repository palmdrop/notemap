import { afterEach } from "vitest";

// The webdav adapter's own fake, taken from its source: it needs nothing but
// `node:http`, and a second copy here would drift from the one its tests trust.
import {
  startDavServer,
  type DavServer,
} from "../../../../packages/adapters/destination-webdav/src/testing/dav-server.ts";

export type { DavServer };

/** A fake Nextcloud per test, stopped whether or not the test got that far. */
export function davServers(): () => Promise<DavServer> {
  const started: DavServer[] = [];

  afterEach(async () => {
    for (const each of started.splice(0)) await each.close();
  });

  return async () => {
    const one = await startDavServer();
    started.push(one);
    return one;
  };
}
