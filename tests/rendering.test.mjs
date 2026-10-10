import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadCatalog } from "../scripts/lib/products.mjs";
import { renderHome } from "../templates/home.mjs";
import { renderProductsIndex } from "../templates/products.mjs";
import { renderLayout } from "../templates/layout.mjs";
import { copyAssets } from "../scripts/lib/assets.mjs";
import { buildSite } from "../scripts/build.mjs";

const catalog = await loadCatalog(process.cwd());
const documentOf = html => new JSDOM(html).window.document;

test("home renders all series once and useful non-JS links", () => {
  const doc = documentOf(renderHome(catalog));
  assert.deepEqual([...doc.querySelectorAll("main > section")].map(el => el.id), ["overview", "series", "matrix-preview", "use-cases", "resources", "sales-assistance"]);
  for (const series of catalog.series) {
    const links = doc.querySelectorAll(`#series a[href="/products/?series=${series.slug}#${series.slug}"]`);
    assert.equal(links.length, 1);
    assert.ok(links[0].textContent.includes(series.name));
  }
  assert.equal(doc.querySelectorAll("#matrix-preview tbody tr").length, 4);
  assert.ok(doc.querySelector('a[href="/compare/"]'));
  assert.ok(doc.querySelector('a[href="/support/"]'));
  assert.ok(doc.querySelector('a[href="/docs/"]'));
  assert.ok(doc.querySelector('a[href="/downloads/"]'));
  assert.ok(doc.querySelector("noscript"));
  assert.equal(doc.querySelector('a[href="#main-content"]').textContent, "跳至主要内容");
  for (const link of doc.querySelectorAll("#use-cases a")) {
    const useCase = new URL(link.href, "https://example.test").searchParams.get("useCase");
    assert.ok(catalog.products.some(product => product.useCases.includes(useCase)));
  }
});

test("product index exposes twelve grouped products with complete source metrics and actions", () => {
  const doc = documentOf(renderProductsIndex(catalog));
  assert.equal(doc.querySelectorAll("article[data-product]").length, 12);
  for (const product of catalog.products) {
    const card = doc.querySelector(`#${product.series} article[data-product="${product.slug}"]`);
    assert.ok(card, product.slug);
    assert.equal(card.querySelector("h3").textContent, product.nameZh);
    assert.equal(card.querySelectorAll("dl > div").length, 4);
    assert.deepEqual([...card.querySelectorAll("dd .metric-value")].map(el => el.textContent), product.coreMetrics.map(metric => metric.value));
    assert.equal(card.querySelector(".status-badge").textContent, "供货请咨询");
    assert.ok(card.querySelector(`a[href="/products/${product.slug}/"]`));
    assert.ok(card.querySelector(`a[href="/compare/?compare=${product.slug}"]`));
    assert.equal(card.querySelector('a[href^="/support/"]').getAttribute("href"), `/support/?product=${product.slug}&intent=quote`);
    assert.equal(card.querySelector("img.product-image").getAttribute("src"), product.heroImage);
    assert.equal(card.querySelector("img.product-image").dataset.fallback, `/assets/product-fallbacks/${product.slug}.svg`);
  }
});

test("layout supplies metadata, accessible navigation and escaped content", () => {
  const doc = documentOf(renderLayout({ title: '标题 <test>', description: '说明 "quote"', route: "/products/", body: "<h1>内容</h1>", styles: ["/assets/styles/products.css"], scripts: ["/assets/client/example.js"] }));
  assert.equal(doc.documentElement.lang, "zh-CN");
  assert.equal(doc.title, "标题 <test> | 正阳恒卓科技");
  assert.equal(doc.querySelector('meta[name="description"]').content, '说明 "quote"');
  assert.equal(doc.querySelector('meta[name="viewport"]').content, "width=device-width, initial-scale=1");
  assert.equal(doc.querySelectorAll('nav[aria-label="主导航"] a').length, 5);
  assert.equal(doc.querySelector('[aria-current="page"]').getAttribute("href"), "/products/");
  assert.ok(doc.querySelector('main#main-content h1'));
  assert.ok(doc.querySelector('img[alt="正阳恒卓科技"][width][height]'));
  assert.match(doc.querySelector("footer").textContent, /北京正阳恒卓科技有限公司/);
  assert.match(doc.querySelector("footer").textContent, /NVIDIA.*Jetson.*商标/);
  assert.equal(doc.querySelector('script[src="/assets/client/example.js"]').defer, true);
  assert.equal(doc.querySelectorAll('link[rel="stylesheet"]').length, 2);
  assert.notEqual(documentOf(renderHome(catalog)).title, documentOf(renderProductsIndex(catalog)).title);
});

test("remote product images switch to local fallback on load failure", () => {
  const dom = new JSDOM(renderProductsIndex(catalog), { runScripts: "dangerously", url: "https://example.test" });
  const img = dom.window.document.querySelector("img.product-image");
  img.dispatchEvent(new dom.window.Event("error"));
  assert.equal(img.getAttribute("src"), img.dataset.fallback);
  img.dispatchEvent(new dom.window.Event("error"));
  assert.equal(img.getAttribute("src"), img.dataset.fallback);
  dom.window.close();
});

test("copyAssets preserves logo bytes, copies client assets and escapes fallback SVG names", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-assets-"));
  await cp(join(process.cwd(), "assets"), join(rootDir, "assets"), { recursive: true });
  await cp(join(process.cwd(), "src"), join(rootDir, "src"), { recursive: true });
  await mkdir(join(rootDir, "src/client"), { recursive: true });
  await writeFile(join(rootDir, "src/client/example.js"), "window.example = true;");
  const outDir = join(rootDir, "dist");
  await copyAssets({ rootDir, outDir, products: [{ ...catalog.products[0], nameZh: 'Product <script> & "name"' }] });
  assert.deepEqual(await readFile(join(rootDir, "assets/brand/zyhz-logo.png")), await readFile(join(outDir, "assets/brand/zyhz-logo.png")));
  assert.equal(await readFile(join(outDir, "assets/client/example.js"), "utf8"), "window.example = true;");
  const svg = await readFile(join(outDir, `assets/product-fallbacks/${catalog.products[0].slug}.svg`), "utf8");
  const doc = new JSDOM(svg, { contentType: "image/svg+xml" }).window.document;
  assert.equal(doc.querySelector("script"), null);
  assert.ok(doc.documentElement.textContent.includes('Product <script> & "name"'));
});

test("build emits both catalog routes and all referenced local styles and image fallbacks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-render-"));
  for (const folder of ["data", "assets", "src"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  const result = await buildSite({ rootDir, outDir });
  assert.deepEqual(result.routes, ["/", "/products/"]);
  for (const path of ["index.html", "products/index.html"]) {
    const doc = documentOf(await readFile(join(outDir, path), "utf8"));
    assert.equal(doc.querySelectorAll("h1").length, 1);
    for (const el of doc.querySelectorAll('link[rel="stylesheet"], img[src^="/assets/"]')) {
      assert.ok((await readFile(join(outDir, el.getAttribute("href") ?? el.getAttribute("src")))).length > 0);
    }
  }
  for (const product of catalog.products) assert.match(await readFile(join(outDir, `assets/product-fallbacks/${product.slug}.svg`), "utf8"), /<svg/);
});
