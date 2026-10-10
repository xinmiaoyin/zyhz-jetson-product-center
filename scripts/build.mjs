import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writePage } from "./lib/site.mjs";
import { loadCatalog } from "./lib/products.mjs";
import { copyAssets } from "./lib/assets.mjs";
import { renderHome } from "../templates/home.mjs";
import { renderProductsIndex } from "../templates/products.mjs";

export async function buildSite({ rootDir, outDir }) {
  const projectDist = resolve(rootDir, "dist");
  if (resolve(outDir) !== projectDist) {
    throw new Error("outDir must be the project's dist directory");
  }
  const catalog = await loadCatalog(rootDir);

  const existing = await lstat(projectDist).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing?.isSymbolicLink()) {
    throw new Error("dist must not be a symbolic link");
  }
  await rm(projectDist, { recursive: true, force: true });
  await mkdir(projectDist, { recursive: true });

  await copyAssets({ rootDir, outDir: projectDist, products: catalog.products });
  const pages = [["/", renderHome(catalog)], ["/products/", renderProductsIndex(catalog)]];
  const routes = pages.map(([route]) => route);
  for (const [route, html] of pages) await writePage({ route, html, outDir: projectDist });
  await writeFile(join(projectDist, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`, "utf8");
  return { routes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildSite({ rootDir: process.cwd(), outDir: resolve(process.cwd(), "dist") });
}
