import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { escapeHtml } from "../scripts/lib/html.mjs";
import { writePage } from "../scripts/lib/site.mjs";
import { buildSite } from "../scripts/build.mjs";
import { createDevServer } from "../scripts/dev-server.mjs";
import { loadCatalog } from "../scripts/lib/products.mjs";

test("escapeHtml protects generated markup", () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
});

test("writePage creates directory-style routes", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "zyhz-site-"));
  await writePage({ route: "/products/agx-orin-64gb/", html: "<h1>AGX Orin 64GB</h1>", outDir });
  assert.match(await readFile(join(outDir, "products/agx-orin-64gb/index.html"), "utf8"), /AGX Orin 64GB/);
});

test("buildSite writes the home page and route manifest", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-build-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  const result = await buildSite({ rootDir, outDir });
  const catalog = await loadCatalog(rootDir);
  const routes = ["/", "/products/", "/compare/", ...catalog.products.map(product => `/products/${product.slug}/`)];
  assert.equal(routes.length, 15);
  assert.deepEqual(result.routes.slice(0, 15), routes);
  assert.equal(result.routes.length, 33);
  assert.match(await readFile(join(outDir, "index.html"), "utf8"), /<!doctype html>/i);
  assert.deepEqual(JSON.parse(await readFile(join(outDir, "routes.json"), "utf8")), result.routes);
  const comparison = await readFile(join(outDir, "compare/index.html"), "utf8");
  for (const product of catalog.products) assert.ok(comparison.includes(product.nameZh));
  assert.match(comparison, /type="module" src="\/assets\/client\/compare.js"/);
  assert.match(await readFile(join(outDir, "assets/client/compare.js"), "utf8"), /mountCompare/);
});

test("dev server serves directory pages and returns 404 for missing files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-server-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  await buildSite({ rootDir, outDir });
  const server = createDevServer({ outDir });
  const handle = server.listeners("request")[0];
  const request = (url) => new Promise((resolve) => {
    const result = { status: null, body: "" };
    handle({ url }, {
      writeHead(status) { result.status = status; return this; },
      end(body) { result.body = String(body ?? ""); resolve(result); },
    });
  });
  const home = await request("/");
  assert.equal(home.status, 200);
  assert.match(home.body, /Jetson 产品中心/);
  assert.equal((await request("/missing/")).status, 404);
});

test("built site checker enforces page, asset, accessibility and catalog invariants", async () => {
  const { checkBuiltSite } = await import("../scripts/check-built-site.mjs");
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-check-built-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  await buildSite({ rootDir, outDir });
  const valid = await checkBuiltSite({ rootDir, outDir });
  assert.equal(valid.pages, 33);
  assert.ok(valid.links > 100);

  const mutate = async (relative, transform, reason) => {
    const path = join(outDir, relative);
    const original = await readFile(path, "utf8");
    await writeFile(path, transform(original));
    await assert.rejects(checkBuiltSite({ rootDir, outDir }), reason);
    await writeFile(path, original);
  };
  await mutate("index.html", html => html.replace("</main>", '<div id="main-content"></div></main>'), /duplicate id/i);
  await mutate("index.html", html => html.replace(/<meta name="description"[^>]*>/, ""), /description/i);
  await mutate("index.html", html => html.replace("/assets/brand/zyhz-logo.png", "/assets/missing.png"), /missing.*asset|missing.*target/i);
  await mutate("index.html", html => html.replace("</main>", '<a href="/missing-route/">断裂链接</a></main>'), /missing.*link|missing.*target/i);
  await mutate("index.html", html => html.replace("</main>", "<p>" + "T" + "BD" + "</p></main>"), /placeholder/i);
  await mutate("index.html", html => html.replace("</main>", '<a href="#not-present">断裂片段</a></main>'), /fragment/i);
  await mutate("index.html", html => html.replace('alt="正阳恒卓科技"', ""), /image.*alt/i);
  await mutate("index.html", html => html.replace('width="1570"', ""), /image.*size|dimensions/i);
  await mutate("index.html", html => html.replace("</main>", '<a href="/"></a></main>'), /empty anchor/i);
  await mutate("support/index.html", html => html.replaceAll("模拟联系信息", "联系信息"), /sample contact|模拟/i);
  await mutate("compare/index.html", html => html.replace(/<noscript>[\s\S]*?<\/noscript>/, ""), /noscript/i);

  const product = (await loadCatalog(rootDir)).products[0];
  await mutate(`products/${product.slug}/index.html`, html => html.replace(product.coreMetrics[0].value, "WRONG-METRIC"), /metric/i);
  await mutate(`products/${product.slug}/index.html`, html => {
    const dom = new JSDOM(html);
    const values = dom.window.document.querySelectorAll("#product-overview .core-metrics > div .metric-value");
    [values[0].textContent, values[1].textContent] = [values[1].textContent, values[0].textContent];
    return dom.serialize();
  }, /metric.*association|metric.*AI 性能/i);

  const routesPath = join(outDir, "routes.json");
  const routesSource = await readFile(routesPath, "utf8");
  await unlink(routesPath);
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /route manifest.*missing/i);
  await writeFile(routesPath, "{not json");
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /route manifest.*malformed/i);
  await writeFile(routesPath, "null");
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /route manifest.*array|route manifest.*canonical/i);
  const routes = JSON.parse(routesSource);
  await writeFile(routesPath, JSON.stringify(routes.slice(1)));
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /generated.*not declared|route manifest/i);
  await writeFile(routesPath, JSON.stringify([...routes, "/ghost/"]));
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /declared.*without generated|route manifest/i);
  await writeFile(routesPath, routesSource);

  const searchPath = join(outDir, "assets/search-index.json");
  const searchSource = await readFile(searchPath, "utf8");
  await unlink(searchPath);
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /search-index.*missing/i);
  await writeFile(searchPath, "not json");
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /search-index.*malformed/i);
  await writeFile(searchPath, "null");
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /search-index.*safe structure/i);
  const searchRecords = JSON.parse(searchSource);
  searchRecords[0].internalSecret = "must-not-ship";
  await writeFile(searchPath, JSON.stringify(searchRecords));
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /search-index.*safe structure|search-index.*field/i);
  await writeFile(searchPath, searchSource);

  const productsPath = join(rootDir, "data/products.json");
  const products = JSON.parse(await readFile(productsPath, "utf8"));
  await writeFile(productsPath, `${JSON.stringify(products.slice(0, 11), null, 2)}\n`);
  await assert.rejects(checkBuiltSite({ rootDir, outDir }), /product count/i);
});

test("dev server sends PNG assets with the correct media type", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "zyhz-server-png-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(rootDir, folder), { recursive: true });
  const outDir = join(rootDir, "dist");
  await buildSite({ rootDir, outDir });
  const server = createDevServer({ outDir });
  const handle = server.listeners("request")[0];
  const result = await new Promise((resolve) => handle({ url: "/assets/brand/zyhz-logo.png" }, {
    writeHead(status, headers) { return Object.assign(this, { status, headers }); },
    end() { resolve({ status: this.status, headers: this.headers }); },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.headers["Content-Type"], "image/png");
});
