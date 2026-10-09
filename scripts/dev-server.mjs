import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build.mjs";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createDevServer({ outDir }) {
  const dist = resolve(outDir);
  return createServer(async (request, response) => {
    let file;
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      file = resolve(dist, `.${pathname}`, pathname.endsWith("/") ? "index.html" : "");
      if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
        response.writeHead(404).end("Not found");
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR" || error instanceof URIError) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(500).end("Server error");
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rootDir = process.cwd();
  const outDir = resolve(rootDir, "dist");
  await buildSite({ rootDir, outDir });
  createDevServer({ outDir }).listen(4173, "127.0.0.1", () => {
    console.log("http://127.0.0.1:4173/");
  });
}
