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

test("catalog validates all twelve unique products and series order", async () => {
  const catalog = await loadCatalog(process.cwd());
  assert.equal(catalog.products.length, 12);
  assert.equal(new Set(catalog.products.map(p => p.slug)).size, 12);
  assert.deepEqual(catalog.series.map(s => s.slug), ["thor", "agx-orin", "orin-nx", "orin-nano"]);
  assert.deepEqual(new Set(catalog.products.map(p => p.series)), new Set(catalog.series.map(s => s.slug)));
  for (const product of catalog.products) assert.ok(productSchema.safeParse(product).success);
});

test("performance strings preserve precision, density and power context", async () => {
  assert.equal(formatPerformance({ label: "AI", value: 2070, unit: "TFLOPS", precision: "FP4", sparsity: "sparse", powerMode: "130 W", sourceReference: "thor", verifiedAt: "2026-10-10" }), "2070 TFLOPS · FP4 · sparse（稀疏） · 130 W");
  assert.match(formatPerformance({ label: "GPU", value: 85, unit: "TOPS", precision: "INT8", sparsity: "dense", powerMode: "官方峰值模式", sourceReference: "orin", verifiedAt: "2026-10-10" }), /INT8.*dense（稠密）.*官方峰值模式/);
  const { products } = await loadCatalog(process.cwd());
  for (const p of products) for (const metric of p.performanceMetrics) {
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
    assert.ok(catalog.sources.some(s => s.url === product.heroImage));
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
