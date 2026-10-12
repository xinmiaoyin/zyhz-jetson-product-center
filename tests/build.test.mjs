import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.equal(result.routes.length, 31);
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
