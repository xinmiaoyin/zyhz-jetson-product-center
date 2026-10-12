import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { formatPerformance, loadCatalog } from "./lib/products.mjs";

async function listHtmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(path));
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

export async function checkBuiltSite({ rootDir, outDir }) {
  const htmlFiles = await listHtmlFiles(outDir);
  const errors = [];
  let links = 0;
  const documents = new Map();
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const route = routeForFile(outDir, file);
    const dom = new JSDOM(html, { url: `https://site.invalid${route}` });
    documents.set(file, dom.window.document);
    errors.push(...pageErrors({ document: dom.window.document, file, route }));
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

  const rawProducts = JSON.parse(await readFile(join(rootDir, "data/products.json"), "utf8"));
  if (!Array.isArray(rawProducts) || rawProducts.length !== 12) errors.push(`${rootDir}: product count must be exactly 12`);
  if (Array.isArray(rawProducts) && rawProducts.length === 12) {
    const catalog = await loadCatalog(rootDir);
    const detailFiles = htmlFiles.filter(file => /^\/products\/[^/]+\/$/.test(routeForFile(outDir, file)));
    if (detailFiles.length !== 12) errors.push(`${outDir}: product detail page count must be exactly 12`);
    for (const product of catalog.products) {
      const file = join(outDir, "products", product.slug, "index.html");
      const document = documents.get(file);
      if (!document) {
        errors.push(`${file}: missing product detail page`);
        continue;
      }
      const overviewText = document.querySelector("#product-overview")?.textContent.replace(/\s+/gu, " ") ?? "";
      const comparisonText = document.querySelector(`#series-comparison [data-product="${product.slug}"]`)?.textContent.replace(/\s+/gu, " ") ?? "";
      for (const metric of product.coreMetrics) {
        if (!overviewText.includes(metric.label) || !overviewText.includes(metric.value)) errors.push(`${file}: product metric disagreement for ${metric.label}`);
      }
      for (const metric of product.performanceMetrics) {
        if (!comparisonText.includes(formatPerformance(metric))) errors.push(`${file}: product metric disagreement for ${metric.precision}`);
      }
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
