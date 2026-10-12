import { lstat, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { writePage } from "./lib/site.mjs";
import { loadCatalog, getRelatedProducts } from "./lib/products.mjs";
import { copyAssets } from "./lib/assets.mjs";
import { renderHome } from "../templates/home.mjs";
import { renderProductsIndex } from "../templates/products.mjs";
import { renderProductDetail } from "../templates/product-detail.mjs";
import { renderCompare } from "../templates/compare.mjs";
import { loadDocuments, buildSearchIndex } from "./lib/content.mjs";
import { renderDocsIndex, renderDocumentPage } from "../templates/docs.mjs";
import { renderDownloads } from "../templates/downloads.mjs";
import { renderSupport } from "../templates/support.mjs";

const text = z.string().trim().min(1);
const contactSchema = z.object({
  isSimulation: z.literal(true),
  manager: text.refine(value => value.includes("示例"), "manager must visibly contain 示例"),
  phone: z.literal("400-000-0000"),
  email: z.email().refine(value => value.endsWith(".invalid"), "email must use .invalid"),
  workHours: text,
  qrPlaceholder: z.literal("二维码示例占位（不可扫描）"),
}).strict();
const downloadSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), product: text, type: text, version: text,
  publishedAt: z.iso.date().nullable(), size: text.nullable(),
  status: z.enum(["available", "preparing"]), href: text.nullable(), sourceReference: text,
}).strict().superRefine((record, ctx) => {
  if ((record.status === "preparing" && record.href !== null) || (record.status === "available" && record.href === null)) {
    ctx.addIssue({ code: "custom", path: ["href"], message: "preparing requires null href; available requires a verified href" });
  }
});

export async function loadSupportData(rootDir, catalog) {
  const parse = async (name, schema) => {
    try { return schema.parse(JSON.parse(await readFile(join(rootDir, "data", `${name}.json`), "utf8"))); }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
  };
  const contact = await parse("contact", contactSchema);
  const downloads = await parse("downloads", z.array(downloadSchema).min(1));
  const ids = new Set();
  const products = new Set(catalog.products.map(product => product.slug));
  const sources = new Map(catalog.sources.map(source => [source.id, source]));
  for (const record of downloads) {
    const fail = (field, message) => { throw new Error(`downloads.${record.id}.${field}: ${message}`); };
    if (ids.has(record.id)) fail("id", "duplicate id");
    ids.add(record.id);
    if (!products.has(record.product)) fail("product", "unknown product slug");
    const source = sources.get(record.sourceReference);
    if (!source) fail("sourceReference", "unknown source ID");
    if (record.status === "preparing") continue;
    // External entries must exactly match an already verified catalog source.
    if (record.href === source.url) continue;
    if (!/^\/assets\/downloads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(record.href)) fail("href", "not a verified source URL or local download path");
    try {
      // The path grammar excludes traversal; reject symlinks/junctions at every
      // component so local resources cannot escape through an asset directory.
      let target = resolve(rootDir);
      const parts = record.href.slice(1).split("/");
      for (const [index, part] of parts.entries()) {
        target = join(target, part);
        const info = await lstat(target);
        const final = index === parts.length - 1;
        if (info.isSymbolicLink() || (final ? !info.isFile() || !info.size : !info.isDirectory())) fail("href", "must resolve to a nonempty regular file within assets/downloads without symlinks");
      }
    } catch (error) { fail("href", `local resource unavailable: ${error.message}`); }
  }
  return { contact, downloads };
}

export async function buildSite({ rootDir, outDir }) {
  const projectDist = resolve(rootDir, "dist");
  if (resolve(outDir) !== projectDist) {
    throw new Error("outDir must be the project's dist directory");
  }
  const catalog = await loadCatalog(rootDir);
  const documents = await loadDocuments(rootDir, catalog);
  const { contact, downloads } = await loadSupportData(rootDir, catalog);

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
  pages.push(["/downloads/", renderDownloads({ downloads, catalog })], ["/support/", renderSupport({ contact, catalog })]);
  await writeFile(join(projectDist, "assets/search-index.json"), `${JSON.stringify(buildSearchIndex(documents, catalog.products), null, 2)}\n`, "utf8");
  const routes = pages.map(([route]) => route);
  for (const [route, html] of pages) await writePage({ route, html, outDir: projectDist });
  await writeFile(join(projectDist, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`, "utf8");
  return { routes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildSite({ rootDir: process.cwd(), outDir: resolve(process.cwd(), "dist") });
}
