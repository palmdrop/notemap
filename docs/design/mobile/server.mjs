// Serves this directory and reloads every open page when a file in it changes.
//
//   node server.mjs [port] [host]      defaults: 5190, 127.0.0.1

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.argv[2] ?? 5190);
const host = process.argv[3] ?? "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
};

const reloadScript = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;
const listeners = new Set();

let pending;
watch(root, { recursive: true }, (_event, file) => {
  if (!file || file.startsWith(".git")) return;
  clearTimeout(pending);
  pending = setTimeout(() => {
    for (const res of listeners) res.write("data: reload\n\n");
  }, 80);
});

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);

  if (path === "/__reload") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write(": open\n\n");
    listeners.add(res);
    req.on("close", () => listeners.delete(res));
    return;
  }

  let file = normalize(join(root, path));
  if (!file.startsWith(root.replace(/\/$/, "") + sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    let body = await readFile(file);
    const type = types[extname(file)] ?? "application/octet-stream";
    if (type.startsWith("text/html")) body = body.toString().replace("</body>", `${reloadScript}</body>`);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(port, host, () => console.log(`http://${host}:${port}/`));
