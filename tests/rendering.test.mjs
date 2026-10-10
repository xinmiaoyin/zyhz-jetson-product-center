import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadCatalog, getRelatedProducts } from "../scripts/lib/products.mjs";
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
  assert.equal(img.alt, catalog.products[0].imageAlt);
  img.dispatchEvent(new dom.window.Event("error"));
  assert.equal(img.getAttribute("src"), img.dataset.fallback);
  assert.equal(img.alt, `${catalog.products[0].nameZh}，产品图片暂不可用`);
  assert.equal(img.onerror, null);
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

test("build emits catalog and twelve detail routes with local styles and image fallbacks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-render-"));
  for (const folder of ["data", "assets", "src"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  const result = await buildSite({ rootDir, outDir });
  assert.deepEqual(result.routes, ["/", "/products/", ...catalog.products.map(product => `/products/${product.slug}/`)]);
  for (const path of ["index.html", "products/index.html", ...catalog.products.map(product => `products/${product.slug}/index.html`)]) {
    const doc = documentOf(await readFile(join(outDir, path), "utf8"));
    assert.equal(doc.querySelectorAll("h1").length, 1);
    for (const table of doc.querySelectorAll("table")) assert.ok(table.querySelector("tbody tr"));
    for (const el of doc.querySelectorAll('link[rel="stylesheet"], img[src^="/assets/"]')) {
      assert.ok((await readFile(join(outDir, el.getAttribute("href") ?? el.getAttribute("src")))).length > 0);
    }
  }
  for (const product of catalog.products) assert.match(await readFile(join(outDir, `assets/product-fallbacks/${product.slug}.svg`), "utf8"), /<svg/);
});

test("AGX Orin 64GB detail follows the approved sales-first order with four metrics and real CTAs", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  const product = catalog.products.find(p => p.slug === "jetson-agx-orin-64gb");
  const doc = documentOf(renderProductDetail({ product, related: getRelatedProducts(product, catalog), catalog }));
  assert.deepEqual([...doc.querySelectorAll("main > section")].map(el => el.id), ["product-overview", "highlights", "use-cases", "specifications", "series-comparison", "technical-resources", "purchasing", "related-products"]);
  assert.equal(doc.querySelector("h1").textContent, product.nameZh);
  assert.equal(doc.querySelectorAll("h1").length, 1);
  assert.ok(doc.querySelector('nav[aria-label="面包屑"] a[href="/products/#agx-orin"]'));
  const overview = doc.querySelector("#product-overview");
  assert.equal(overview.querySelectorAll(".core-metrics > div").length, 4);
  assert.deepEqual([...overview.querySelectorAll(".metric-value")].map(el => el.textContent), product.coreMetrics.map(metric => metric.value));
  assert.equal(overview.querySelector('a[href*="intent=quote"]').getAttribute("href"), "/support/?product=jetson-agx-orin-64gb&intent=quote");
  assert.equal(overview.querySelector('a[href*="intent=quote"]').textContent, "获取报价");
  assert.ok(overview.querySelector('a[href="/support/?product=jetson-agx-orin-64gb"]'));
  assert.ok(overview.querySelector('a[href="#specifications"]'));
  assert.equal(doc.querySelectorAll("#highlights li").length, product.highlights.length);
  assert.deepEqual([...doc.querySelectorAll("#use-cases li")].map(el => el.textContent), product.useCases);
  assert.deepEqual([...doc.querySelectorAll("#related-products article")].map(el => el.dataset.product), product.relatedProducts);
  assert.equal(doc.querySelector("script"), null);
});

test("detail renders verified type-specific specifications and resolves evidence and resource links", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  for (const product of catalog.products) {
    const doc = documentOf(renderProductDetail({ product, related: [], catalog }));
    const tables = [...doc.querySelectorAll("#specifications table")];
    assert.equal(tables.length, product.specGroups.length);
    product.specGroups.forEach((group, i) => {
      assert.equal(tables[i].querySelector("caption").textContent, group.title);
      const rows = [...tables[i].querySelectorAll("tbody tr")];
      assert.equal(rows.length, group.rows.length);
      group.rows.forEach((row, j) => {
        assert.equal(rows[j].querySelector('th[scope="row"]').textContent, row.label);
        assert.equal(rows[j].querySelector(".spec-value").textContent, row.value);
        assert.equal(rows[j].querySelector("a").href, catalog.sources.find(source => source.id === row.sourceReference).url);
        assert.equal(rows[j].querySelector("time").dateTime, row.verifiedAt);
      });
    });
    for (const id of product.documents) {
      const source = catalog.sources.find(source => source.id === id);
      assert.ok([...doc.querySelectorAll("#technical-resources a")].some(link => link.href === source.url && link.textContent.includes(source.title)));
    }
    for (const id of product.downloads) assert.ok([...doc.querySelectorAll("#technical-resources a")].some(link => link.href === catalog.sources.find(source => source.id === id).url));
    assert.ok(doc.querySelector(`#technical-resources a[href="/docs/?product=${product.slug}"]`));
    assert.ok(doc.querySelector(`#technical-resources a[href="/downloads/?product=${product.slug}"]`));
    if (product.productType === "developer-kit") {
      assert.deepEqual([...doc.querySelectorAll("#package-contents li")].map(el => el.textContent), product.packageContents);
      assert.ok(doc.querySelector('#technical-resources a[data-quick-start="true"]'));
    } else assert.equal(doc.querySelector("#package-contents"), null);
    assert.ok(doc.querySelector("#purchasing").textContent.includes(product.officialPartNumber));
    assert.equal(doc.querySelector("#optional-accessories"), null);
    assert.equal(doc.querySelector("#related-products"), null);
  }
});

test("performance output and same-series detail comparison preserve complete precision context without ranking", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  for (const product of catalog.products) {
    const doc = documentOf(renderProductDetail({ product, related: [], catalog }));
    const comparison = doc.querySelector("#series-comparison");
    const siblings = catalog.products.filter(item => item.series === product.series);
    assert.deepEqual([...comparison.querySelectorAll("tbody tr")].map(el => el.dataset.product), siblings.map(item => item.slug));
    for (const sibling of siblings) {
      const row = comparison.querySelector(`[data-product="${sibling.slug}"]`);
      assert.ok(row.querySelector(`a[href="/products/${sibling.slug}/"]`));
      for (const metric of sibling.performanceMetrics) {
        const expected = `${metric.value} ${metric.unit} · ${metric.precision} · ${metric.sparsity === "sparse" ? "sparse（稀疏）" : "dense（稠密）"} · ${metric.powerMode}`;
        assert.ok(row.textContent.includes(expected));
      }
    }
    assert.doesNotMatch(doc.body.textContent, /性能排名|第[一二三四]名/);
    assert.match(comparison.textContent, /不同计算口径不可直接按数值比较/);
  }
});

test("detail images retain dimensions, lazy related images, and accessible one-shot fallback", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  const product = catalog.products[0];
  const dom = new JSDOM(renderProductDetail({ product, related: getRelatedProducts(product, catalog), catalog }), { runScripts: "dangerously", url: "https://example.test" });
  const images = [...dom.window.document.querySelectorAll("img.product-image")];
  assert.ok(images.length > 1);
  for (const img of images) {
    assert.ok(Number(img.width) > 0 && Number(img.height) > 0);
    if (!img.closest("#product-overview")) assert.equal(img.getAttribute("loading"), "lazy");
    const source = catalog.products.find(item => img.dataset.fallback.endsWith(`/${item.slug}.svg`));
    assert.equal(img.alt, source.imageAlt);
    img.dispatchEvent(new dom.window.Event("error"));
    assert.equal(img.getAttribute("src"), `/assets/product-fallbacks/${source.slug}.svg`);
    assert.equal(img.alt, `${source.nameZh}，产品图片暂不可用`);
    assert.equal(img.onerror, null);
    img.dispatchEvent(new dom.window.Event("error"));
    assert.equal(img.getAttribute("src"), `/assets/product-fallbacks/${source.slug}.svg`);
  }
  dom.window.close();
});

test("detail omits empty optional sections and escapes text in populated optional content", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  const product = { ...catalog.products[1], documents: [], downloads: [], softwareSupport: [], packageContents: [], optionalAccessories: [] };
  const isolated = { ...catalog, products: [product] };
  const doc = documentOf(renderProductDetail({ product, related: [], catalog: isolated }));
  assert.equal(doc.querySelector("#technical-resources"), null);
  assert.equal(doc.querySelector("#series-comparison"), null);
  assert.equal(doc.querySelector("#optional-accessories"), null);
  const label = '<img src=x onerror="alert(1)">';
  const populated = documentOf(renderProductDetail({ product: { ...product, optionalAccessories: [label], internalSku: "示例 <test>" }, related: [], catalog: isolated }));
  assert.equal(populated.querySelector("#optional-accessories li").textContent, label);
  assert.equal(populated.querySelector("#optional-accessories img"), null);
  assert.match(populated.querySelector("#purchasing").textContent, /示例 <test>/);
});
