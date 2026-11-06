import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadCatalog } from "../scripts/lib/products.mjs";
import { renderMarkdown, loadDocuments, buildSearchIndex, searchIndex } from "../scripts/lib/content.mjs";
import { renderDocsIndex, renderDocumentPage } from "../templates/docs.mjs";
import { mountSearch } from "../src/client/search.js";
import { buildSite } from "../scripts/build.mjs";

const catalog = await loadCatalog(process.cwd());

test("markdown keeps Chinese heading anchors unique and commands inert after sanitization", () => {
  const { html, headings } = renderMarkdown('## 接口说明\n\n## 接口说明\n\n## 接口说明-2\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[坏链接](javascript:alert(1))\n\n<iframe src="https://evil.test"></iframe><form><input></form><svg onload="alert(1)"></svg>\n\n```bash\nsudo reboot\n<script>alert(2)</script>\n```\n\n[官方](https://developer.nvidia.com/embedded/faq)\n\n<div class="callout warning evil" style="color:red" onclick="alert(1)">注意</div>');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  assert.equal(doc.querySelector("h2").id, "接口说明");
  assert.equal(new Set(headings.map(h => h.id)).size, 3);
  assert.equal(doc.querySelectorAll("script,img,iframe,form,input,svg,button,[onclick],[style]").length, 0);
  assert.equal(doc.querySelector('a[href^="javascript:"]'), null);
  assert.equal(doc.querySelector("pre code.language-bash").textContent, 'sudo reboot\n<script>alert(2)</script>\n');
  assert.equal(doc.querySelector('a[href^="https:"]').rel, "noopener noreferrer");
  assert.equal(doc.querySelector(".evil"), null);
  assert.ok(doc.querySelector(".callout.warning"));
  assert.deepEqual(renderMarkdown("## 接口说明").headings, [{ depth: 2, id: "接口说明", text: "接口说明" }]);
  dom.window.close();
});

test("documents cover all twelve products with fifteen verified customer articles", async () => {
  const documents = await loadDocuments(process.cwd(), catalog);
  assert.ok(documents.length >= 15);
  const nvidiaProducts = catalog.products.filter(product => product.series !== "zyhz-systems");
  assert.equal(nvidiaProducts.length, 12);
  for (const product of nvidiaProducts) assert.ok(documents.some(doc => doc.product === product.slug && doc.slug === "product-resources"), product.slug);
  for (const doc of documents) {
    assert.ok(catalog.products.some(product => product.slug === doc.product));
    assert.ok(doc.sourceReferences.length);
    assert.ok(doc.sourceReferences.every(id => catalog.sources.some(source => source.id === id)));
    const dom = new JSDOM(doc.html);
    for (const link of dom.window.document.querySelectorAll('a[href^="https:"]')) {
      assert.ok(catalog.sources.some(source => source.url === link.href && doc.sourceReferences.includes(source.id)), link.href);
    }
    dom.window.close();
  }
  assert.deepEqual(documents.filter(doc => doc.product === "jetson-agx-orin-64gb").map(doc => doc.slug), ["product-resources", "quick-start", "flashing-and-jetpack", "interfaces"]);
});

test("markdown canonicalizes whitespace in external href before applying link protections", () => {
  const { html } = renderMarkdown('<a href=" &#x09;ht&#x09;tps://developer.nvidia.com/embedded/faq ">官方资料</a><a href="\\\\evil.test">错误入口</a>');
  const dom = new JSDOM(html);
  const link = dom.window.document.querySelector("a");
  assert.equal(link.getAttribute("href"), "https://developer.nvidia.com/embedded/faq");
  assert.equal(link.rel, "noopener noreferrer");
  assert.equal(dom.window.document.querySelectorAll("a[href]").length, 1);
  dom.window.close();
});

test("markdown normalizes raw HTML heading ids, deduplicates globally and reserves template ids", () => {
  const { html, headings } = renderMarkdown('## Sources Heading\n\n<h2 id="sources-heading">Raw source collision</h2>\n\n<h2 id="RAW custom id">Raw source collision</h2>');
  const doc = new JSDOM(html).window.document;
  assert.deepEqual([...doc.querySelectorAll("h2")].map(heading => heading.id), ["sources-heading-2", "raw-source-collision", "raw-source-collision-2"]);
  assert.deepEqual(headings.map(heading => heading.id), ["sources-heading-2", "raw-source-collision", "raw-source-collision-2"]);
});

test("documents reject malformed front matter, unknown associations and undeclared external sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "zyhz-docs-invalid-"));
  const directory = join(root, "content/docs/jetson-agx-orin-64gb");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "sample.md");
  const metadata = { title: "测试", product: "jetson-agx-orin-64gb", order: 1, summary: "测试文档", sourceReferences: ["faq"] };
  const save = async (meta, body = "## 测试") => writeFile(path, `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n${body}`);
  await save({ ...metadata, product: "missing-product" });
  await assert.rejects(loadDocuments(root, catalog), /product/);
  await save({ ...metadata, sourceReferences: ["missing-source"] });
  await assert.rejects(loadDocuments(root, catalog), /source/);
  await save({ ...metadata, order: "first" });
  await assert.rejects(loadDocuments(root, catalog), /order/);
  await save(metadata, "[链接](https://example.com/unverified)");
  await assert.rejects(loadDocuments(root, catalog), /source|link/);
  await save(metadata, '<a href=" &#x09;https://example.com/unverified ">链接</a>');
  await assert.rejects(loadDocuments(root, catalog), /source|link/);
  await writeFile(path, "# No metadata");
  await assert.rejects(loadDocuments(root, catalog), /front matter/);
});

test("search index whitelists public text and prioritizes normalized exact titles over body matches", async () => {
  const documents = await loadDocuments(process.cwd(), catalog);
  const products = structuredClone(catalog.products);
  products[0].internalSecret = "DO_NOT_PUBLISH";
  documents[0].internalSecret = "DO_NOT_PUBLISH";
  const records = buildSearchIndex(documents, products);
  assert.equal(records.length, documents.length + products.length);
  assert.ok(records.some(record => record.text.includes("AGX Orin 64GB")));
  assert.ok(records.some(record => record.text.includes("系统刷写")));
  assert.doesNotMatch(JSON.stringify(records), /DO_NOT_PUBLISH|sourceReferences|checkedAt|verifiedAt|heroImage|internalSku/);
  for (const record of records) assert.deepEqual(Object.keys(record).sort(), ["product", "text", "title", "type", "url"]);
  const fixture = [
    { title: "其他标题", text: "系统刷写", url: "/body/" },
    { title: "系统刷写详解", text: "", url: "/partial/" },
    { title: "系统刷写", text: "", url: "/exact/" },
    { title: "Jetson AGX Orin", text: "", url: "/english/" },
  ];
  assert.deepEqual(searchIndex(fixture, " 系统刷写 ").map(r => r.url), ["/exact/", "/partial/", "/body/"]);
  assert.deepEqual(searchIndex(fixture, "  JETSON   agx orin  ").map(r => r.url), ["/english/"]);
  assert.deepEqual(searchIndex(fixture, " \n\t "), []);
  assert.deepEqual(searchIndex(fixture, "不存在"), []);
});

test("document pages contain complete article, official sources, navigation and TOC without JavaScript", async () => {
  const documents = await loadDocuments(process.cwd(), catalog);
  const document = documents.find(doc => doc.slug === "flashing-and-jetpack");
  const page = renderDocumentPage({ document, navigation: documents, catalog });
  const dom = new JSDOM(page);
  const doc = dom.window.document;
  assert.ok(page.includes(document.html));
  const article = new JSDOM(document.html);
  assert.equal(doc.querySelector("article").textContent, article.window.document.body.textContent);
  article.window.close();
  assert.ok(doc.querySelector(`a[href="/products/${document.product}/"]`));
  assert.ok(doc.querySelector('nav[aria-label="文档导航"] a[aria-current="page"]'));
  assert.ok(doc.querySelector('nav[aria-label="本文目录"] a[href^="#"]'));
  assert.ok(doc.querySelector('a[rel="prev"]'));
  assert.ok(doc.querySelector('a[rel="next"]'));
  assert.ok(doc.querySelector('[data-document-sources] a[href^="https:"]'));
  for (const a of doc.querySelectorAll('a[href^="https:"]')) assert.equal(a.rel, "noopener noreferrer");
  const index = new JSDOM(renderDocsIndex({ documents, catalog }));
  assert.match(index.window.document.querySelector("noscript").textContent, /动态搜索.*JavaScript/);
  assert.equal(index.window.document.querySelectorAll("[data-doc-list] a").length, documents.length);
  dom.window.close(); index.window.close();
});

test("search UI loads once, renders safe results, handles empty queries, clear and empty results", async () => {
  const documents = await loadDocuments(process.cwd(), catalog);
  const dom = new JSDOM(renderDocsIndex({ documents, catalog }));
  const root = dom.window.document.querySelector("[data-doc-search]");
  const input = root.querySelector("input");
  let calls = 0;
  const records = [{ title: "<img src=x onerror=alert(1)>", product: "Jetson AGX Orin 64GB", type: "document", url: "/docs/safe/", text: "test" }];
  mountSearch(root, async () => { calls++; return { ok: true, json: async () => records }; });
  const update = async value => { input.value = value; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); await new Promise(resolve => setImmediate(resolve)); };
  await update("test");
  assert.match(root.querySelector("[data-search-results]").textContent, /技术文档.*Jetson AGX Orin 64GB/);
  assert.equal(root.querySelector("img"), null);
  assert.ok(root.querySelector('a[href="/docs/safe/"]'));
  await update("不存在");
  assert.match(root.querySelector('[role="status"]').textContent, /没有找到/);
  assert.ok(root.querySelector('[data-search-guidance]:not([hidden]) a[href="/products/#agx-orin"]'));
  root.querySelector("[data-search-clear]").click();
  assert.equal(input.value, "");
  assert.match(root.querySelector('[role="status"]').textContent, /输入/);
  assert.equal(dom.window.document.activeElement, input);
  assert.equal(calls, 1);
  dom.window.close();
});

test("build emits docs routes and public search JSON alongside all existing routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "zyhz-docs-build-"));
  for (const folder of ["data", "assets", "src", "content"]) await cp(join(process.cwd(), folder), join(root, folder), { recursive: true });
  const { routes } = await buildSite({ rootDir: root, outDir: join(root, "dist") });
  const documents = await loadDocuments(root, catalog);
  assert.equal(routes.length, 6 + catalog.products.length + documents.length);
  for (const route of ["/", "/products/", "/compare/", "/docs/", "/docs/jetson-agx-orin-64gb/flashing-and-jetpack/", ...catalog.products.map(p => `/products/${p.slug}/`)]) assert.ok(routes.includes(route));
  const html = await readFile(join(root, "dist/docs/jetson-agx-orin-64gb/flashing-and-jetpack/index.html"), "utf8");
  assert.match(html, /<article/);
  assert.match(html, /系统刷写/);
  const records = JSON.parse(await readFile(join(root, "dist/assets/search-index.json"), "utf8"));
  assert.equal(records.length, documents.length + catalog.products.length);
  assert.ok(searchIndex(records, "系统刷写").length);
});

test("visual training product is searchable without leaking customer or tender context", async () => {
  const records = buildSearchIndex(await loadDocuments(process.cwd(), catalog), catalog.products);
  const product = records.find(record => record.url === "/products/vision-training-kit/");
  assert.ok(product);
  assert.match(product.text, /视觉实训.*157 TOPS/s);
  assert.doesNotMatch(product.text, /北京中医药大学|采购数量|投标|比选|报价/iu);
});
