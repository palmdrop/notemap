import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const TITLE = "A placeholder page";
export const DESCRIPTION =
  "Every path on this server answers with this page, so a link to any of them has a preview.";

/** A one-pixel PNG. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const IMAGE = "placeholder.png";

export type PageServerOptions = {
  /** Absent is one the operating system picks. */
  readonly port?: number;
  /** Absent is loopback alone. */
  readonly host?: string;
  /**
   * What the page names as its image. A browser loads it itself, so it has to
   * be somewhere a browser reaches. Absent is this server's own.
   */
  readonly image?: string;
};

export type PageServer = {
  readonly url: string;
  close(): Promise<void>;
};

export async function startPageServer(
  options: PageServerOptions = {},
): Promise<PageServer> {
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://pages").pathname;

    if (path.endsWith(`/${IMAGE}`)) {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(PIXEL.byteLength),
      });
      response.end(PIXEL);
      return;
    }

    const page = html(options.image ?? `/${IMAGE}`);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(Buffer.byteLength(page)),
    });
    response.end(page);
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve),
  );
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function html(image: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${TITLE}</title>
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:image" content="${escaped(image)}">
</head>
<body><p>${DESCRIPTION}</p></body>
</html>
`;
}

function escaped(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
