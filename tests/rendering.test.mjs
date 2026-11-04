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
  assert.equal(doc.querySelector('#matrix-preview a[href="/products/mi-12x4/"]'), null);
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

test("product index exposes eighteen grouped products with complete source metrics and appropriate actions", () => {
  const doc = documentOf(renderProductsIndex(catalog));
  assert.equal(doc.querySelectorAll("article[data-product]").length, 18);
  for (const product of catalog.products) {
    const card = doc.querySelector(`#${product.series} article[data-product="${product.slug}"]`);
    assert.ok(card, product.slug);
    assert.equal(card.querySelector("h3").textContent, product.nameZh);
    assert.equal(card.querySelectorAll("dl > div").length, 4);
    assert.deepEqual([...card.querySelectorAll("dd .metric-value")].map(el => el.textContent), product.coreMetrics.map(metric => metric.value));
    assert.equal(card.querySelector(".status-badge").textContent, "供货请咨询");
    assert.ok(card.querySelector(`a[href="/products/${product.slug}/"]`));
    assert.equal(Boolean(card.querySelector(`a[href="/compare/?compare=${product.slug}"]`)), Boolean(product.performanceMetrics?.length));
    assert.equal(card.querySelector('a[href^="/support/"]').getAttribute("href"), `/support/?product=${product.slug}&intent=quote`);
    assert.equal(card.querySelector("img.product-image").getAttribute("src"), product.heroImage);
    assert.equal(card.querySelector("img.product-image").dataset.fallback, `/assets/product-fallbacks/${product.slug}.svg`);
  }
});

const systemModels = [
  ["mi-12x4", "边缘计算盒", "png"],
  ["mi-19x2", "边缘计算盒", "jpg"],
  ["mi-19x3", "边缘计算盒", "png"],
  ["mi-11x8", "边缘计算盒", "png"],
  ["mi-13x8", "边缘计算盒", "png"],
  ["c1201", "载板", "png"],
];

test("the fifth catalog series groups six locally illustrated systems with Chinese type labels", () => {
  const doc = documentOf(renderProductsIndex(catalog));
  const section = doc.querySelector(".catalog-section:last-child");
  assert.equal(section.id, "zyhz-systems");
  assert.equal(section.querySelector("h2").textContent, "正阳恒卓整机与载板");
  assert.deepEqual([...section.querySelectorAll("article")].map(card => card.dataset.product), systemModels.map(([slug]) => slug));
  for (const [slug, type, extension] of systemModels) {
    const card = section.querySelector(`[data-product="${slug}"]`);
    assert.equal(card.querySelector(".product-type").textContent, type);
    assert.equal(card.querySelector("img").getAttribute("src"), `/assets/products/${slug}/hero.${extension}`);
    assert.equal(card.querySelector(".product-visual noscript"), null);
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
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  const result = await buildSite({ rootDir, outDir });
  assert.deepEqual(result.routes.slice(0, 15), ["/", "/products/", "/compare/", ...catalog.products.map(product => `/products/${product.slug}/`)]);
  assert.equal(result.routes.length, 33);
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
  for (const product of catalog.products.filter(item => item.performanceMetrics?.length)) {
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
    assert.ok(doc.querySelector(`#technical-resources a[href="/docs/${product.slug}/product-resources/"]`));
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

test("system detail follows the sales-first order with a local manual and a contextual quote", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  for (const [slug, type, extension] of systemModels) {
    const product = catalog.products.find(item => item.slug === slug);
    assert.equal(product.performanceMetrics, undefined);
    const doc = documentOf(renderProductDetail({ product, related: getRelatedProducts(product, catalog), catalog }));
    assert.equal(doc.querySelector("h1").textContent, product.nameZh);
    assert.deepEqual([...doc.querySelectorAll("main > section")].map(el => el.id), ["product-overview", "highlights", "use-cases", "specifications", "product-manuals", "purchasing", "related-products"]);
    assert.equal(doc.querySelector("#product-overview .product-type").textContent, type);
    assert.equal(doc.querySelector("#product-overview img").getAttribute("src"), `/assets/products/${slug}/hero.${extension}`);
    assert.deepEqual([...doc.querySelectorAll("#product-overview .metric-value")].map(el => el.textContent), product.coreMetrics.map(metric => metric.value));
    assert.equal(doc.querySelector('#product-overview a[href*="intent=quote"]').getAttribute("href"), `/support/?product=${slug}&intent=quote`);
    assert.ok(doc.querySelector("#specifications tbody tr"));
    assert.match(doc.querySelector(`#product-manuals a[href="/assets/manuals/${slug}.html"]`).textContent, /产品手册/);
    assert.equal(doc.querySelector("#product-manuals h2").textContent, "产品手册");
    assert.equal(doc.querySelector("#purchasing h2").textContent, "采购咨询");
    assert.deepEqual([...doc.querySelectorAll("#related-products article")].map(el => el.dataset.product), product.relatedProducts);
    assert.equal(doc.querySelector('main a[href^="/downloads/"]'), null);
  }
});

test("performance output and same-series detail comparison preserve complete precision context without ranking", async () => {
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  for (const product of catalog.products.filter(item => item.performanceMetrics?.length)) {
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
    assert.match(comparison.textContent, /同系列产品并列展示/);
    assert.doesNotMatch(comparison.textContent, /开发套件与模组并列展示/);
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

const sampleContact = { isSimulation: true, manager: "示例客户经理", phone: "400-000-0000", email: "sales@example.invalid", workHours: "工作日 9:00–18:00", qrPlaceholder: "二维码示例占位（不可扫描）" };
const sampleDownload = { id: "d1", product: "jetson-agx-orin-64gb", type: "数据手册", version: "待发布", publishedAt: null, size: null, status: "preparing", href: null, sourceReference: "orin-spec" };

test("support page clearly labels simulated contact data and escapes product context", async () => {
  const { renderSupport } = await import("../templates/support.mjs");
  const product = catalog.products.find(p => p.slug === "jetson-agx-orin-64gb");
  const doc = documentOf(renderSupport({ contact: sampleContact, selectedProduct: product, catalog }));
  assert.match(doc.querySelector("main").textContent, /模拟联系信息/);
  assert.match(doc.querySelector("[data-support-context]").textContent, /Jetson AGX Orin 64GB/);
  for (const label of ["客户经理（模拟）", "联系电话（模拟）", "联系邮箱（模拟）", "工作时间（模拟）"]) assert.ok(doc.body.textContent.includes(label));
  assert.ok(doc.querySelector('a[href="tel:400-000-0000"]'));
  assert.ok(doc.querySelector('a[href="mailto:sales@example.invalid"]'));
  assert.match(doc.querySelector("[data-qr-placeholder]").textContent, /示例.*不可扫描/);
  assert.equal(doc.querySelector("[data-qr-placeholder] img, [data-qr-placeholder] canvas, form"), null);
  assert.match(doc.body.textContent, /不接收.*咨询|不收集.*信息/);
  const unsafe = '<img src=x onerror="alert(1)">';
  const escaped = documentOf(renderSupport({ contact: { ...sampleContact, manager: unsafe }, selectedProduct: { ...product, nameEn: unsafe } }));
  assert.ok(escaped.querySelector("[data-support-context]").textContent.includes(unsafe));
  assert.equal(escaped.querySelector('img[src="x"]'), null);
});

test("missing download is rendered as disabled preparation state with all records visible without JS", async () => {
  const { renderDownloads } = await import("../templates/downloads.mjs");
  const source = catalog.sources.find(s => s.id === "jetpack");
  const available = { ...sampleDownload, id: "d2", type: "软件工具", version: "以官方入口为准", status: "available", href: source.url, sourceReference: source.id };
  const doc = documentOf(renderDownloads({ downloads: [sampleDownload, available], catalog }));
  const pending = doc.querySelector('[data-download-id="d1"]');
  assert.match(pending.textContent, /资料准备中/);
  assert.equal(pending.querySelector("[aria-disabled=true]").tagName, "SPAN");
  assert.equal(pending.querySelector("a[data-download-link]"), null);
  assert.equal(doc.querySelector('a[href=""], [data-download-id][hidden]'), null);
  const active = doc.querySelector('[data-download-id="d2"]');
  assert.equal(active.querySelector("a[data-download-link]").href, source.url);
  assert.match(active.textContent, /版本.*以官方入口为准/);
  assert.match(active.textContent, /发布日期.*未标注/);
  assert.match(active.textContent, /大小.*官方/);
  assert.ok(active.textContent.includes(source.title));
  assert.equal(doc.querySelectorAll("[data-download-id]").length, 2);
  for (const select of doc.querySelectorAll("select")) assert.ok(select.labels.length);
});

test("downloads and support data reject invalid associations and links before touching dist", async () => {
  const { loadSupportData } = await import("../scripts/build.mjs");
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-support-invalid-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  await mkdir(outDir);
  await writeFile(join(outDir, "sentinel.txt"), "keep existing build");
  await writeFile(join(rootDir, "data/contact.json"), JSON.stringify(sampleContact));
  const available = { ...sampleDownload, status: "available", href: "https://developer.nvidia.com/embedded/jetpack/downloads", sourceReference: "jetpack" };
  for (const [record, reason] of [
    [{ ...sampleDownload, product: "not-a-product" }, /product/],
    [{ ...sampleDownload, sourceReference: "missing-source" }, /sourceReference/],
    [{ ...sampleDownload, href: "https://example.com" }, /href/],
    [{ ...available, href: "https://example.com/unverified" }, /href/],
    [{ ...available, href: "https://developer.nvidia.com/embedded/jetpack/downloads?mirror=1" }, /href/],
    [{ ...available, href: "javascript:alert(1)" }, /href/],
    [{ ...available, href: "//evil.test/download" }, /href/],
    [{ ...available, href: "/assets/downloads/missing.pdf" }, /href/],
    [{ ...available, href: "/assets/downloads/../../data/contact.json" }, /href/],
    [{ ...sampleDownload, publishedAt: "2026-13-01" }, /publishedAt/],
    [{ ...sampleDownload, status: "ready" }, /status/],
    [{ ...sampleDownload, unexpected: "must fail" }, /unrecognized|unexpected/i],
  ]) {
    await writeFile(join(rootDir, "data/downloads.json"), JSON.stringify([record]));
    await assert.rejects(buildSite({ rootDir, outDir }), reason);
    assert.equal(await readFile(join(outDir, "sentinel.txt"), "utf8"), "keep existing build");
  }
  await writeFile(join(rootDir, "data/downloads.json"), JSON.stringify([sampleDownload, sampleDownload]));
  await assert.rejects(loadSupportData(rootDir, catalog), /duplicate/);
  await writeFile(join(rootDir, "data/downloads.json"), JSON.stringify([available]));
  for (const [contact, reason] of [
    [{ ...sampleContact, isSimulation: false }, /isSimulation/],
    [{ ...sampleContact, email: "sales@example.com" }, /email/],
    [{ ...sampleContact, manager: "客户经理" }, /manager/],
    [{ ...sampleContact, phone: "13800138000" }, /phone/],
    [{ ...sampleContact, qrPlaceholder: "扫码咨询" }, /qrPlaceholder/],
  ]) {
    await writeFile(join(rootDir, "data/contact.json"), JSON.stringify(contact));
    await assert.rejects(buildSite({ rootDir, outDir }), reason);
    assert.equal(await readFile(join(outDir, "sentinel.txt"), "utf8"), "keep existing build");
  }
  await writeFile(join(rootDir, "data/contact.json"), JSON.stringify(sampleContact));
  assert.equal((await loadSupportData(rootDir, catalog)).downloads[0].href, available.href);
  await mkdir(join(rootDir, "assets/downloads"), { recursive: true });
  await writeFile(join(rootDir, "assets/downloads/sample.txt"), "Test resource");
  await writeFile(join(rootDir, "data/downloads.json"), JSON.stringify([{ ...available, href: "/assets/downloads/sample.txt" }]));
  assert.equal((await loadSupportData(rootDir, catalog)).downloads[0].href, "/assets/downloads/sample.txt");
  await writeFile(join(rootDir, "assets/downloads/empty.txt"), "");
  await writeFile(join(rootDir, "data/downloads.json"), JSON.stringify([{ ...available, href: "/assets/downloads/empty.txt" }]));
  await assert.rejects(loadSupportData(rootDir, catalog), /nonempty|href/i);
});

test("local downloads reject symlink or junction path components", async (t) => {
  const { symlink } = await import("node:fs/promises");
  const { loadSupportData } = await import("../scripts/build.mjs");
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-support-link-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outside = join(rootDir, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "sample.txt"), "outside resource");
  const link = join(rootDir, "assets/downloads/linked");
  await mkdir(join(rootDir, "assets/downloads"), { recursive: true });
  try { await symlink(outside, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(`platform cannot create a directory link: ${error.code}`);
    throw error;
  }
  const record = { ...sampleDownload, status: "available", href: "/assets/downloads/linked/sample.txt", sourceReference: "jetpack" };
  await writeFile(join(rootDir, "data/contact.json"), JSON.stringify(sampleContact));
  await writeFile(join(rootDir, "data/downloads.json"), JSON.stringify([record]));
  await assert.rejects(loadSupportData(rootDir, catalog), /symlink|href/i);
});

test("build adds downloads and support while preserving all 31 prior routes and quote contexts", async () => {
  const { loadDocuments } = await import("../scripts/lib/content.mjs");
  const documents = await loadDocuments(process.cwd(), catalog);
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-support-build-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  const { routes } = await buildSite({ rootDir, outDir });
  const priorRoutes = ["/", "/products/", "/compare/", ...catalog.products.map(p => `/products/${p.slug}/`), "/docs/", ...documents.map(d => d.url)];
  assert.equal(priorRoutes.length, 31);
  assert.deepEqual(routes, [...priorRoutes, "/downloads/", "/support/"]);
  const slugs = new Set(catalog.products.map(p => p.slug));
  for (const route of routes) {
    const doc = documentOf(await readFile(join(outDir, route, "index.html"), "utf8"));
    for (const link of doc.querySelectorAll('a[href*="intent=quote"]')) {
      assert.ok(slugs.has(new URL(link.href, "https://example.test").searchParams.get("product")));
    }
    if (["/downloads/", "/support/"].includes(route)) {
      assert.ok(doc.querySelector('script[type="module"][src="/assets/client/feedback.js"]'));
      assert.equal(doc.querySelectorAll("h1").length, 1);
    }
  }
  assert.ok((await readFile(join(outDir, "assets/client/feedback.js"))).length);
});
