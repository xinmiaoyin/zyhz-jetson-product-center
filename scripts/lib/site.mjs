import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function routeToFile(route, outDir) {
  const clean = route.replace(/^\/+|\/+$/g, "");
  return join(outDir, clean, "index.html");
}

export async function writePage({ route, html, outDir }) {
  const file = routeToFile(route, outDir);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, html, "utf8");
  return file;
}
