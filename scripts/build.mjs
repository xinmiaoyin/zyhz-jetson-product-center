import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writePage } from "./lib/site.mjs";
import { loadCatalog, getRelatedProducts } from "./lib/products.mjs";
import { copyAssets } from "./lib/assets.mjs";
import { renderHome } from "../templates/home.mjs";
import { renderProductsIndex } from "../templates/products.mjs";
import { renderProductDetail } from "../templates/product-detail.mjs";
import { renderCompare } from "../templates/compare.mjs";
import { loadDocuments, buildSearchIndex } from "./lib/content.mjs";
import { renderDocsIndex, renderDocumentPage } from "../templates/docs.mjs";

export async function buildSite({ rootDir, outDir }) {
  const projectDist = resolve(rootDir, "dist");
  if (resolve(outDir) !== projectDist) {
    throw new Error("outDir must be the project's dist directory");
  }
  const catalog = await loadCatalog(rootDir);
  const documents = await loadDocuments(rootDir, catalog);

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
  const pages = [["/", renderHome(catalog)], ["/products/", renderProductsIndex(catalog)], ["/compare/", renderCompare(catalog)]];
  for (const product of catalog.products) pages.push([
    `/products/${product.slug}/`,
    renderProductDetail({ product, related: getRelatedProducts(product, catalog), catalog }),
  ]);
  pages.push(["/docs/", renderDocsIndex({ documents, catalog })]);
  for (const document of documents) pages.push([document.url, renderDocumentPage({ document, navigation: documents, catalog })]);
  await writeFile(join(projectDist, "assets/search-index.json"), `${JSON.stringify(buildSearchIndex(documents, catalog.products), null, 2)}\n`, "utf8");
  const routes = pages.map(([route]) => route);
  for (const [route, html] of pages) await writePage({ route, html, outDir: projectDist });
  await writeFile(join(projectDist, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`, "utf8");
  return { routes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildSite({ rootDir: process.cwd(), outDir: resolve(process.cwd(), "dist") });
}
