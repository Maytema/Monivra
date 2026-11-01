import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

// Serves the repository folder on a free port; resolves with the server and its address.
export function serveApp() {
  return new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      const name =
        request.url === "/" ? "index.html" : decodeURIComponent(request.url.split("?")[0]);
      try {
        const content = await readFile(path.join(root, name));
        response.writeHead(200, {
          "Content-Type": types[path.extname(name)] ?? "application/octet-stream",
        });
        response.end(content);
      } catch {
        response.writeHead(404).end();
      }
    }).listen(0, () => resolve({ server, address: `http://localhost:${server.address().port}` }));
  });
}
