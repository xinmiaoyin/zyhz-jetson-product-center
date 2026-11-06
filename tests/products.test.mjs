import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog, getProduct, getRelatedProducts, formatPerformance, productSchema } from "../scripts/lib/products.mjs";
import { buildSite } from "../scripts/build.mjs";

async function fixture(t, mutate) {
  const root = await mkdtemp(join(tmpdir(), "zyhz-catalog-"));
  await cp(join(process.cwd(), "data"), join(root, "data"), { recursive: true });
  const products = JSON.parse(await readFile(join(root, "data/products.json"), "utf8"));
  if (mutate) {
    mutate(products);
    await writeFile(join(root, "data/products.json"), JSON.stringify(products));
  }
  return root;
}

test("catalog validates all nineteen unique products and five ordered series", async () => {
  const catalog = await loadCatalog(process.cwd());
  assert.equal(catalog.products.length, 19);
  assert.equal(new Set(catalog.products.map(p => p.slug)).size, 19);
  assert.deepEqual(catalog.series.map(({ slug, order }) => [slug, order]), [
    ["thor", 1], ["agx-orin", 2], ["orin-nx", 3], ["orin-nano", 4], ["zyhz-systems", 5],
  ]);
  assert.equal(catalog.series[4].name, "正阳恒卓整机与载板");
  assert.deepEqual(new Set(catalog.products.map(p => p.series)), new Set(catalog.series.map(s => s.slug)));
  for (const product of catalog.products) assert.ok(productSchema.safeParse(product).success);
  assert.deepEqual(catalog.products.map(({ slug, series, productType }) => [slug, series, productType]), [
    ["jetson-agx-thor-developer-kit", "thor", "developer-kit"],
    ["jetson-t5000", "thor", "production-module"],
    ["jetson-t4000", "thor", "production-module"],
    ["jetson-agx-orin-developer-kit", "agx-orin", "developer-kit"],
    ["jetson-agx-orin-64gb", "agx-orin", "production-module"],
    ["jetson-agx-orin-industrial", "agx-orin", "industrial-module"],
    ["jetson-agx-orin-32gb", "agx-orin", "production-module"],
    ["jetson-orin-nx-16gb", "orin-nx", "production-module"],
    ["jetson-orin-nx-8gb", "orin-nx", "production-module"],
    ["jetson-orin-nano-super-developer-kit", "orin-nano", "developer-kit"],
    ["jetson-orin-nano-8gb", "orin-nano", "production-module"],
    ["jetson-orin-nano-4gb", "orin-nano", "production-module"],
    ["mi-12x4", "zyhz-systems", "edge-computer"],
    ["mi-19x2", "zyhz-systems", "edge-computer"],
    ["mi-19x3", "zyhz-systems", "edge-computer"],
    ["mi-11x8", "zyhz-systems", "edge-computer"],
    ["mi-13x8", "zyhz-systems", "edge-computer"],
    ["c1201", "zyhz-systems", "carrier-board"],
    ["vision-training-kit", "zyhz-systems", "vision-training-system"],
  ]);
});

test("approved NVIDIA modules use local display images without replacing official hero evidence", async () => {
  const catalog = await loadCatalog(process.cwd());
  for (const slug of ["jetson-agx-orin-64gb", "jetson-orin-nx-16gb", "jetson-orin-nano-8gb", "jetson-t5000"]) {
    const product = getProduct(slug, catalog);
    assert.equal(product.displayImage, `/assets/products/${slug}/display.png`);
    assert.match(product.heroImage, /^https:\/\//);
    assert.ok(catalog.sources.some(source => source.url === product.heroImage && product.sourceReferences.includes(source.id)));
  }
  for (const product of catalog.products.filter(item => !["jetson-agx-orin-64gb", "jetson-orin-nx-16gb", "jetson-orin-nano-8gb", "jetson-t5000"].includes(item.slug))) {
    assert.equal(product.displayImage, undefined, product.slug);
  }
});

test("visual training kit publishes the approved 157 TOPS evidence and procurement entry points", async () => {
  const catalog = await loadCatalog(process.cwd());
  const product = getProduct("vision-training-kit", catalog);
  assert.equal(product.productType, "vision-training-system");
  assert.equal(product.heroImage, "/assets/products/vision-training-kit/hero.png");
  assert.equal(product.performanceMetrics.length, 1);
  assert.equal(formatPerformance(product.performanceMetrics[0]), "157 TOPS · INT8 · sparse（稀疏） · Super 模式");
  assert.deepEqual(product.coreMetrics.map(metric => metric.value), [
    "157 TOPS · INT8 · sparse（稀疏） · Super 模式",
    "16GB 128-bit LPDDR5",
    "2000 万像素工业相机",
    "≥19 英寸电容触控屏",
  ]);
  assert.deepEqual(product.documents, ["vision-training-kit-manual"]);
  assert.ok(product.relatedProducts.includes("jetson-orin-nano-super-developer-kit"));
});

test("ZYHZ products use local manuals and images with optional performance metrics", async () => {
  const catalog = await loadCatalog(process.cwd());
  for (const [slug, model, extension] of [
    ["mi-12x4", "MI-12x4", "png"],
    ["mi-19x2", "MI-19x2", "png"],
    ["mi-19x3", "MI-19x3", "png"],
    ["mi-11x8", "MI-11x8-S", "png"],
    ["mi-13x8", "MI-13x8", "png"],
    ["c1201", "C1201", "png"],
  ]) {
    const product = getProduct(slug, catalog);
    assert.equal(product.officialPartNumber, model);
    assert.equal(product.performanceMetrics, undefined);
    assert.equal(product.heroImage, `/assets/products/${slug}/hero.${extension}`);
    const manualId = `${slug}-manual`;
    assert.ok(product.documents.includes(manualId));
    assert.ok(product.sourceReferences.includes(manualId));
    assert.ok(product.specGroups.flatMap(g => g.rows).every(row => row.sourceReference === manualId));
    assert.deepEqual(
      catalog.sources.filter(s => s.id === manualId).map(({ publisher, url }) => [publisher, url]),
      [["正阳恒卓", `/assets/manuals/${slug}.html`]],
    );
  }
});

test("product schema accepts the ZYHZ branch without NVIDIA performance or type-specific rows", async () => {
  const [original] = JSON.parse(await readFile("data/products.json", "utf8"));
  const { performanceMetrics, ...product } = original;
  const candidate = {
    ...product,
    series: "zyhz-systems",
    productType: "edge-computer",
    heroImage: "/assets/products/mi-12x4/hero.png",
    coreMetrics: product.coreMetrics.map(() => ({ label: "接口", value: "HDMI" })),
    specGroups: [{ title: "接口", rows: [{ label: "显示", value: "HDMI", sourceReference: "mi-12x4-manual", verifiedAt: "2026-11-05" }] }],
  };
  assert.ok(productSchema.safeParse(candidate).success);
  assert.ok(productSchema.safeParse({ ...candidate, productType: "vision-training-system" }).success);
  assert.equal(productSchema.safeParse({ ...candidate, productType: "developer-kit" }).success, false);
  assert.equal(productSchema.safeParse({ ...candidate, series: "thor" }).success, false);
  for (const path of ["//example.com/hero.png", "/assets/../hero.png", "/assets/%2e%2e/hero.png", "/assets/..\\hero.png", "/assets/hero.png?q=1"]) {
    const result = productSchema.safeParse({ ...candidate, heroImage: path });
    assert.equal(result.success, false, path);
    assert.ok(result.error.issues.some(issue => issue.path[0] === "heroImage"), path);
  }
  const nvidia = JSON.parse(await readFile("data/products.json", "utf8"))[0];
  assert.ok(productSchema.safeParse({ ...nvidia, displayImage: "/assets/products/jetson-agx-thor-developer-kit/display.png" }).success);
  for (const displayImage of ["https://example.com/display.png", "/assets/../display.png", "/images/display.png"]) {
    const result = productSchema.safeParse({ ...nvidia, displayImage });
    assert.equal(result.success, false, displayImage);
    assert.ok(result.error.issues.some(issue => issue.path[0] === "displayImage"), displayImage);
  }
});

test("review performance display uses only complete validated metrics", async () => {
  const catalog = await loadCatalog(process.cwd());
  for (const product of catalog.products.filter(p => p.series !== "zyhz-systems")) {
    assert.ok(product.performanceMetrics.length);
    assert.ok(product.performanceMetrics.some(m => formatPerformance(m) === product.coreMetrics[0].value));
    assert.ok(product.specGroups.flatMap(g => g.rows).filter(r => r.label === "AI 性能").every(r => product.performanceMetrics.some(m => formatPerformance(m) === r.value)));
  }
  assert.doesNotMatch(JSON.stringify(catalog.products), /241\s*TOPS/i);
});

const reviewCases = [
  ["bare core performance", p => { p[0].coreMetrics[0].value = "999 TOPS"; }, /coreMetrics\.0\.value.*performance/],
  ["contextual but unmatched performance", p => { p[0].coreMetrics[0].value = "999 TOPS · INT8 · sparse（稀疏） · 130 W"; }, /coreMetrics\.0\.value.*performance/],
  ["bare performance in highlight", p => { p[0].highlights[0] = "性能达到 999 TOPS 的新产品"; }, /highlights\.0.*performance/],
  ["bare performance in specification", p => { p[0].specGroups[0].rows[1].value = "999 TOPS"; }, /specGroups\.0\.rows\.1\.value.*performance/],
  ["performance hidden in note", p => { p[0].coreMetrics[1].note = "999 TOPS"; }, /coreMetrics\.1\.note.*performance/],
  ["empty performance metrics", p => { p[0].performanceMetrics = []; }, /performanceMetrics/],
  ["mismatched AI specification evidence", p => { p[0].specGroups[0].rows[0].sourceReference = "faq"; }, /specGroups\.0\.rows\.0.*performance/],
  ["module without carrier compatibility", p => { p[1].specGroups.forEach(g => { g.rows = g.rows.filter(r => r.label !== "载板适配"); }); }, /载板适配/],
  ["kit without quick start row", p => { p[0].specGroups.forEach(g => { g.rows = g.rows.filter(r => r.label !== "快速开始"); }); }, /快速开始/],
  ["kit without quick start document", p => { p[0].documents = ["thor-spec"]; }, /documents.*quick start/],
  ["kit with wrong quick start source", p => { p[0].specGroups.flatMap(g => g.rows).find(r => r.label === "快速开始").sourceReference = "thor-spec"; }, /快速开始.*sourceReference/],
  ["malformed hero URL", p => { p[0].heroImage = "not-a-url"; }, /heroImage.*URL/i],
];
for (const [name, mutate, reason] of reviewCases) test(`review rejects ${name} before build writes`, async t => {
  const rootDir = await fixture(t, mutate);
  const outDir = join(rootDir, "dist");
  await assert.rejects(buildSite({ rootDir, outDir }), error => {
    assert.ok(!(error instanceof TypeError));
    assert.match(error.message, /jetson-/);
    assert.match(error.message, reason);
    return true;
  });
  await assert.rejects(access(outDir), { code: "ENOENT" });
});

test("review malformed source URL retains source field diagnostics", async t => {
  const rootDir = await fixture(t);
  const path = join(rootDir, "data/sources.json");
  const sources = JSON.parse(await readFile(path, "utf8"));
  sources[0].url = "not-a-url";
  await writeFile(path, JSON.stringify(sources));
  await assert.rejects(buildSite({ rootDir, outDir: join(rootDir, "dist") }), error => {
    assert.ok(!(error instanceof TypeError));
    assert.match(error.message, /sources\.0\.url.*URL/i);
    return true;
  });
  await assert.rejects(access(join(rootDir, "dist")), { code: "ENOENT" });
});

for (const [field, invalid, reason] of [["verifiedAt", "2026-02-30", /Invalid ISO date/], ["value", 0, /expected number to be >0/]]) {
  test(`review invalid performance ${field} keeps full build diagnostics and preserves dist`, async t => {
    const rootDir = await fixture(t, products => { products[0].performanceMetrics[0][field] = invalid; });
    const outDir = join(rootDir, "dist");
    const diagnostic = error => {
      assert.match(error.message, new RegExp(`jetson-agx-thor-developer-kit performanceMetrics\\.0\\.${field}:`));
      assert.match(error.message, reason);
      return true;
    };
    await assert.rejects(buildSite({ rootDir, outDir }), diagnostic);
    await assert.rejects(access(outDir), { code: "ENOENT" });
    await mkdir(outDir);
    await writeFile(join(outDir, "index.html"), "previous successful build");
    await assert.rejects(buildSite({ rootDir, outDir }), diagnostic);
    assert.equal(await readFile(join(outDir, "index.html"), "utf8"), "previous successful build");
    const [product] = JSON.parse(await readFile(join(rootDir, "data/products.json"), "utf8"));
    assert.equal(productSchema.safeParse(product).success, false);
  });
}

test("performance strings preserve precision, density and power context", async () => {
  assert.equal(formatPerformance({ label: "AI", value: 2070, unit: "TFLOPS", precision: "FP4", sparsity: "sparse", powerMode: "130 W", sourceReference: "thor", verifiedAt: "2026-10-10" }), "2070 TFLOPS · FP4 · sparse（稀疏） · 130 W");
  assert.match(formatPerformance({ label: "GPU", value: 85, unit: "TOPS", precision: "INT8", sparsity: "dense", powerMode: "官方峰值模式", sourceReference: "orin", verifiedAt: "2026-10-10" }), /INT8.*dense（稠密）.*官方峰值模式/);
  const { products } = await loadCatalog(process.cwd());
  for (const p of products) for (const metric of p.performanceMetrics ?? []) {
    assert.match(formatPerformance(metric), new RegExp(metric.precision));
    assert.ok(metric.sourceReference);
  }
  assert.throws(() => formatPerformance({ value: 10 }), /precision|label/);
});

test("relationships and all individual specification sources resolve", async () => {
  const catalog = await loadCatalog(process.cwd());
  const ids = new Set(catalog.sources.map(s => s.id));
  const p = getProduct("jetson-t5000", catalog);
  assert.equal(p.nameEn, "Jetson T5000");
  assert.deepEqual(getRelatedProducts(p, catalog).map(r => r.slug), p.relatedProducts);
  assert.throws(() => getProduct("missing", catalog), /missing/);
  for (const product of catalog.products) {
    for (const id of product.sourceReferences) assert.ok(ids.has(id));
    for (const group of product.specGroups) for (const row of group.rows) {
      assert.ok(ids.has(row.sourceReference));
      assert.match(row.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    }
    if (product.series !== "zyhz-systems") assert.ok(catalog.sources.some(s => s.url === product.heroImage));
  }
});

test("catalog distinguishes Thor MIG hardware from release-specific software support", async () => {
  const catalog = await loadCatalog(process.cwd());
  const t4000 = getProduct("jetson-t4000", catalog);
  const rows = t4000.specGroups.flatMap(g => g.rows);
  assert.ok(rows.some(r => r.label === "MIG 软件状态" && /39\.2\.1.*不支持/.test(r.value)));
  const t5000 = getProduct("jetson-t5000", catalog);
  assert.ok(t5000.specGroups.flatMap(g => g.rows).some(r => r.label === "MIG 软件状态" && /技术预览/.test(r.value)));
});

const invalidCases = [
  ["duplicate slug", p => { p[1].slug = p[0].slug; }, /slug.*duplicate/],
  ["missing required name", p => { delete p[0].nameZh; }, /nameZh/],
  ["unknown related product", p => { p[0].relatedProducts = ["missing"]; }, /relatedProducts.*missing/],
  ["self relationship", p => { p[0].relatedProducts = [p[0].slug]; }, /relatedProducts.*self/],
  ["unknown product source", p => { p[0].sourceReferences.push("missing"); }, /sourceReferences.*missing/],
  ["unknown performance source", p => { p[0].performanceMetrics[0].sourceReference = "missing"; }, /performanceMetrics\.0\.sourceReference.*missing/],
  ["missing performance density", p => { delete p[0].performanceMetrics[0].sparsity; }, /performanceMetrics\.0\.sparsity/],
  ["missing row source", p => { delete p[0].specGroups[0].rows[0].sourceReference; }, /specGroups\.0\.rows\.0\.sourceReference/],
  ["unknown row source", p => { p[0].specGroups[0].rows[0].sourceReference = "missing"; }, /specGroups\.0\.rows\.0\.sourceReference.*missing/],
  ["missing row date", p => { delete p[0].specGroups[0].rows[0].verifiedAt; }, /specGroups\.0\.rows\.0\.verifiedAt/],
  ["impossible date", p => { p[0].verifiedAt = "2026-02-30"; }, /verifiedAt/],
  ["date without matching source check", p => { p[0].specGroups[0].rows[0].verifiedAt = "2026-10-09"; }, /verifiedAt.*checkedAt/],
  ["unmarked internal SKU", p => { p[0].internalSku = "ZY-123"; }, /internalSku/],
  ["unregistered image", p => { p[0].heroImage = "https://www.nvidia.com/unknown.png"; }, /heroImage/],
  ["local NVIDIA image", p => { p[0].heroImage = "/assets/products/mi-12x4/hero.png"; }, /heroImage.*URL/i],
  ["developer kit without package", p => { p[0].packageContents = []; }, /packageContents/],
  ["module without connector", p => { const m = p.find(x => x.slug === "jetson-t5000"); for (const g of m.specGroups) g.rows = g.rows.filter(r => r.label !== "连接器"); }, /连接器/],
  ["industrial without temperature", p => { const m = p.find(x => x.productType === "industrial-module"); for (const g of m.specGroups) g.rows = g.rows.filter(r => r.label !== "工作温度"); }, /工作温度/],
];
for (const [name, mutate, reason] of invalidCases) test(`catalog rejects ${name} with product and field diagnostics`, async t => {
  const root = await fixture(t, mutate);
  await assert.rejects(loadCatalog(root), error => {
    assert.match(error.message, /jetson-/);
    assert.match(error.message, reason);
    return true;
  });
});

test("catalog rejects broken series and duplicate source IDs", async t => {
  const root = await fixture(t);
  const sources = JSON.parse(await readFile(join(root, "data/sources.json"), "utf8"));
  sources.push(sources[0]);
  await writeFile(join(root, "data/sources.json"), JSON.stringify(sources));
  await assert.rejects(loadCatalog(root), /sources.*duplicate/);
  sources.pop();
  await writeFile(join(root, "data/sources.json"), JSON.stringify(sources));
  await writeFile(join(root, "data/series.json"), "[]");
  await assert.rejects(loadCatalog(root), /series/);
});

test("catalog rejects a registered ZYHZ source on an NVIDIA product", async t => {
  const root = await fixture(t, products => { products[0].sourceReferences.push("first-party-manual"); });
  const path = join(root, "data/sources.json");
  const sources = JSON.parse(await readFile(path, "utf8"));
  sources.push({
    id: "first-party-manual", title: "正阳恒卓产品手册", url: "/assets/manuals/c1201.html",
    publisher: "正阳恒卓", checkedAt: "2026-11-05",
  });
  await writeFile(path, JSON.stringify(sources));
  await assert.rejects(loadCatalog(root), /jetson-agx-thor-developer-kit sourceReferences\.\d+:.*NVIDIA/);
});

test("catalog rejects a registered NVIDIA source on a ZYHZ product", async t => {
  const root = await fixture(t, products => {
    const product = getProduct("mi-12x4", { products });
    product.sourceReferences.push("thor-spec");
  });
  await assert.rejects(loadCatalog(root), /mi-12x4 sourceReferences\.\d+:.*正阳恒卓/);
});

test("catalog build validation fails before creating or changing dist", async t => {
  const rootDir = await fixture(t, p => { delete p[0].nameZh; });
  const outDir = join(rootDir, "dist");
  await assert.rejects(buildSite({ rootDir, outDir }), /jetson-agx-thor-developer-kit.*nameZh/);
  await assert.rejects(access(outDir), { code: "ENOENT" });
  await mkdir(outDir);
  await writeFile(join(outDir, "previous.txt"), "previous successful build");
  await assert.rejects(buildSite({ rootDir, outDir }), /nameZh/);
  assert.equal(await readFile(join(outDir, "previous.txt"), "utf8"), "previous successful build");
});
