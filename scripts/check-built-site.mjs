import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateSync } from "node:zlib";
import { assertPublicContent, validateManuals } from "./build.mjs";
import { JSDOM } from "jsdom";
import { formatPerformance, loadCatalog } from "./lib/products.mjs";

async function listHtmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "assets") files.push(...await listHtmlFiles(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".html") files.push(path);
  }
  return files.sort();
}

const routeForFile = (outDir, file) => {
  const path = relative(outDir, file).split(sep).join("/");
  if (path === "index.html") return "/";
  return `/${path.replace(/index\.html$/, "")}`;
};

const resolveTarget = (value, route) => {
  let url;
  try { url = new URL(value, `https://site.invalid${route}`); }
  catch { return { invalid: true }; }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return url.origin === "https://site.invalid" ? { internal: true, url } : { external: true, url };
  }
  return { ignored: true, url };
};

async function targetExists(outDir, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = resolve(outDir, `.${decoded}`);
  const root = resolve(outDir);
  if (target !== root && !target.startsWith(`${root}${sep}`)) return false;
  const candidates = decoded.endsWith("/") ? [join(target, "index.html")] : [target, join(target, "index.html")];
  for (const path of candidates) if (await stat(path).then(info => info.isFile()).catch(() => false)) return true;
  return false;
}

async function htmlTargetFile(outDir, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = resolve(outDir, `.${decoded}`);
  const candidates = decoded.endsWith("/") ? [join(target, "index.html")] : [target, join(target, "index.html")];
  for (const path of candidates) if (extname(path).toLowerCase() === ".html" && await stat(path).then(info => info.isFile()).catch(() => false)) return path;
  return null;
}

function pageErrors({ document, file, route }) {
  const errors = [];
  if (document.documentElement.lang !== "zh-CN") errors.push(`${file}: missing or incorrect lang`);
  if (!document.title.trim()) errors.push(`${file}: missing title`);
  if (!document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim()) errors.push(`${file}: missing description`);
  if (!document.querySelector("h1")) errors.push(`${file}: missing H1`);
  const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) errors.push(`${file}: duplicate id ${duplicateIds.join(", ")}`);
  for (const image of document.querySelectorAll("img")) {
    if (!image.hasAttribute("alt")) errors.push(`${file}: image without alt`);
    const width = Number(image.getAttribute("width"));
    const height = Number(image.getAttribute("height"));
    if (!(width > 0 && height > 0)) errors.push(`${file}: image without explicit dimensions`);
  }
  for (const anchor of document.querySelectorAll("a")) {
    const accessible = anchor.getAttribute("aria-label")?.trim() || anchor.textContent.trim() || anchor.querySelector("img[alt]")?.getAttribute("alt")?.trim();
    if (!accessible) errors.push(`${file}: empty anchor`);
  }
  const text = document.body?.textContent ?? "";
  if (/(?:400-000-0000|sales@example\.invalid|示例客户经理|二维码示例占位)/.test(text) && !/模拟联系信息/.test(text)) {
    errors.push(`${file}: sample contact content is not marked 模拟联系信息`);
  }
  if (document.querySelector("script[src]") && !document.querySelector("noscript")) errors.push(`${file}: interactive page missing noscript`);
  if (/\b(?:TBD|TODO|FIXME)\b|lorem ipsum/iu.test(text)) errors.push(`${file}: prohibited placeholder token`);
  return errors;
}

async function readJsonArtifact(path, label, errors) {
  let source;
  try { source = await readFile(path, "utf8"); }
  catch (error) {
    errors.push(`${label} missing: ${path}`);
    return { ok: false };
  }
  try { return { ok: true, value: JSON.parse(source) }; }
  catch { errors.push(`${label} malformed JSON: ${path}`); return { ok: false }; }
}

function validateRouteManifest(manifest, generatedRoutes, errors) {
  if (!Array.isArray(manifest) || manifest.some(route => typeof route !== "string" || !/^\/(?:[a-z0-9-]+\/)*$/u.test(route))) {
    errors.push("route manifest must be an array of canonical directory routes");
    return;
  }
  if (new Set(manifest).size !== manifest.length) errors.push("route manifest contains duplicate routes");
  const declared = new Set(manifest);
  for (const route of generatedRoutes) if (!declared.has(route)) errors.push(`route manifest: generated route not declared ${route}`);
  for (const route of declared) if (!generatedRoutes.has(route)) errors.push(`route manifest: declared route without generated HTML ${route}`);
}

function validateSearchIndex(records, generatedRoutes, errors) {
  const safeKeys = ["product", "text", "title", "type", "url"];
  const expectedCount = [...generatedRoutes].filter(route => /^\/(?:products\/[^/]+|docs\/[^/]+\/[^/]+)\/$/.test(route)).length;
  if (!Array.isArray(records) || records.length !== expectedCount) {
    errors.push(`search-index safe structure requires exactly ${expectedCount} records`);
    return;
  }
  const identities = new Set();
  for (const [index, record] of records.entries()) {
    const keys = record && typeof record === "object" && !Array.isArray(record) ? Object.keys(record).sort() : [];
    if (keys.length !== safeKeys.length || keys.some((key, i) => key !== safeKeys[i])) {
      errors.push(`search-index safe structure has unexpected fields at record ${index}`);
      continue;
    }
    if (![record.product, record.text, record.title, record.url].every(value => typeof value === "string") || !["product", "document"].includes(record.type)) {
      errors.push(`search-index safe structure has invalid field types at record ${index}`);
      continue;
    }
    const routePattern = record.type === "product" ? /^\/products\/[a-z0-9-]+\/$/ : /^\/docs\/[a-z0-9-]+\/[a-z0-9-]+\/$/;
    if (!record.title.trim() || !record.product.trim() || !record.text.trim() || !routePattern.test(record.url) || !generatedRoutes.has(record.url)) {
      errors.push(`search-index safe structure has invalid content at record ${index}`);
    }
    const identity = `${record.type}:${record.url}`;
    if (identities.has(identity)) errors.push(`search-index safe structure has duplicate URL ${record.url}`);
    identities.add(identity);
  }
}

function validatePng(image) {
  if (!image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return false;
  const data = [];
  for (let offset = 8; offset + 12 <= image.length;) {
    const length = image.readUInt32BE(offset);
    const end = offset + 8 + length;
    if (end + 4 > image.length || crc32(image.subarray(offset + 4, end)) !== image.readUInt32BE(end)) return false;
    const type = image.toString("ascii", offset + 4, offset + 8);
    if (offset === 8 && (type !== "IHDR" || length !== 13 || !image.readUInt32BE(16) || !image.readUInt32BE(20))) return false;
    if (type === "IDAT") data.push(image.subarray(offset + 8, end));
    if (type === "IEND") return length === 0 && end + 4 === image.length && inflateSync(Buffer.concat(data), { maxOutputLength: 64 * 1024 * 1024 }).length > 0;
    offset = end + 4;
  }
  return false;
}

function validateJpeg(image) {
  if (image.length < 4 || image.readUInt16BE(0) !== 0xffd8) return false;
  const endOfImage = image.lastIndexOf(Buffer.from("ffd9", "hex"));
  let hasFrame = false;
  for (let offset = 2; offset + 4 < image.length;) {
    if (image[offset] !== 0xff) return false;
    const marker = image[offset + 1];
    const length = image.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > image.length) return false;
    if (marker === 0xc0 || marker === 0xc2) hasFrame = length >= 8 && image.readUInt16BE(offset + 5) > 0 && image.readUInt16BE(offset + 7) > 0;
    if (marker === 0xda) return hasFrame && end < endOfImage;
    offset = end;
  }
  return false;
}

async function validateProductImage(outDir, url) {
  try {
    const image = await readFile(join(outDir, url));
    const valid = url.endsWith(".png") ? validatePng(image) : url.endsWith(".jpg") && validateJpeg(image);
    if (valid) return;
  } catch { /* Report missing and unreadable image data uniformly. */ }
  throw new Error("invalid product image: " + url);
}

export async function checkBuiltSite({ rootDir, outDir }) {
  const catalog = await loadCatalog(rootDir);
  await validateManuals(outDir, catalog);
  for (const product of catalog.products) {
    if (product.heroImage.startsWith("/assets/")) await validateProductImage(outDir, product.heroImage);
  }
  const htmlFiles = await listHtmlFiles(outDir);
  const errors = [];
  let links = 0;
  const documents = new Map();
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    assertPublicContent(html, file);
    const route = routeForFile(outDir, file);
    const dom = new JSDOM(html, { url: `https://site.invalid${route}` });
    documents.set(file, dom.window.document);
    errors.push(...pageErrors({ document: dom.window.document, file, route }));
  }
  const generatedRoutes = new Set(htmlFiles.map(file => routeForFile(outDir, file)));
  const manifest = await readJsonArtifact(join(outDir, "routes.json"), "route manifest", errors);
  if (manifest.ok) validateRouteManifest(manifest.value, generatedRoutes, errors);
  const searchIndex = await readJsonArtifact(join(outDir, "assets/search-index.json"), "search-index", errors);
  if (searchIndex.ok) {
    assertPublicContent(JSON.stringify(searchIndex.value), "search-index");
    validateSearchIndex(searchIndex.value, generatedRoutes, errors);
  }
  for (const [file, document] of documents) {
    const route = routeForFile(outDir, file);
    const references = [
      ...[...document.querySelectorAll("a[href], link[href]")].map(node => ({ node, value: node.getAttribute("href"), kind: "link" })),
      ...[...document.querySelectorAll("script[src], img[src]")].map(node => ({ node, value: node.getAttribute("src"), kind: "asset" })),
    ];
    for (const reference of references) {
      links += 1;
      const target = resolveTarget(reference.value, route);
      if (target.invalid) {
        errors.push(`${file}: invalid ${reference.kind} URL ${reference.value}`);
        continue;
      }
      if (!target.internal) continue;
      if (target.url.pathname === "/support/" && target.url.searchParams.get("intent") === "quote") {
        const slug = target.url.searchParams.get("product");
        const expected = reference.node.closest("[data-product]")?.dataset.product ?? /^\/products\/([^/]+)\/$/.exec(route)?.[1];
        if (!catalog.products.some(product => product.slug === slug) || (expected && slug !== expected)) errors.push(file + ": incorrect quote product slug " + slug);
      }
      if (!(await targetExists(outDir, target.url.pathname))) {
        errors.push(`${file}: missing internal ${reference.kind} target ${target.url.pathname}`);
        continue;
      }
      if (reference.node.tagName === "A" && target.url.hash) {
        const targetFile = await htmlTargetFile(outDir, target.url.pathname);
        const targetDocument = targetFile ? documents.get(targetFile) : null;
        const id = decodeURIComponent(target.url.hash.slice(1));
        if (!targetDocument?.getElementById(id)) errors.push(`${file}: missing fragment ${target.url.pathname}${target.url.hash}`);
      }
    }
  }

  const detailRoutes = [...generatedRoutes].filter(route => /^\/products\/[^/]+\/$/.test(route));
  if (detailRoutes.length !== catalog.products.length) errors.push("product detail page count does not match catalog");
  for (const product of catalog.products) {
    const file = join(outDir, "products", product.slug, "index.html");
    const document = documents.get(file);
    if (!document) {
      errors.push(`${file}: missing product detail page`);
      continue;
    }
    const comparisonText = document.querySelector(`#series-comparison [data-product="${product.slug}"]`)?.textContent.replace(/\s+/gu, " ") ?? "";
    const metricNodes = [...document.querySelectorAll("#product-overview .core-metrics > div")];
    if (metricNodes.length !== product.coreMetrics.length) errors.push(`${file}: product metric association count disagreement`);
    for (const [index, metric] of product.coreMetrics.entries()) {
      const node = metricNodes[index];
      const label = node?.querySelector("dt")?.textContent.trim() ?? "";
      const value = node?.querySelector(".metric-value")?.textContent.trim() ?? "";
      const note = node?.querySelector("small")?.textContent.trim() ?? "";
      if (label !== metric.label || value !== metric.value || note !== (metric.note ?? "")) {
        errors.push(`${file}: product metric association disagreement for ${metric.label}`);
      }
    }
    for (const metric of product.performanceMetrics ?? []) {
      if (!comparisonText.includes(formatPerformance(metric))) errors.push(`${file}: product metric disagreement for ${metric.precision}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return { pages: htmlFiles.length, links };
}

export async function checkExternalLinks(outDir, { timeout = 2500 } = {}) {
  const urls = new Set();
  for (const file of await listHtmlFiles(outDir)) {
    const document = new JSDOM(await readFile(file, "utf8")).window.document;
    for (const node of document.querySelectorAll("a[href], img[src]")) {
      const value = node.getAttribute(node.hasAttribute("href") ? "href" : "src");
      if (/^https:\/\//i.test(value)) urls.add(value);
    }
  }
  const warnings = [];
  await Promise.all([...urls].map(async url => {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(timeout) });
      if (!response.ok) warnings.push(`${url}: HTTP ${response.status}`);
    } catch (error) { warnings.push(`${url}: ${error.name === "TimeoutError" ? "timeout" : error.message}`); }
  }));
  return warnings.sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rootDir = process.cwd();
  const result = await checkBuiltSite({ rootDir, outDir: resolve(rootDir, "dist") });
  console.log(`Checked ${result.pages} pages and ${result.links} links.`);
  for (const warning of await checkExternalLinks(resolve(rootDir, "dist"))) console.warn(`External link warning: ${warning}`);
}
