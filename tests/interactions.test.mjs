import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadCatalog } from "../scripts/lib/products.mjs";
import { renderCompare } from "../templates/compare.mjs";
import { parseCompareState, serializeCompareState, applyFilters, toggleComparedProduct, mountCompare } from "../src/client/compare.js";

const catalog = await loadCatalog(process.cwd());
const valid = new Set(["a", "b", "c", "d", "e"]);
const empty = () => ({ series: [], types: [], memory: [], power: [], industrial: false, useCases: [], status: [], compare: [] });
function page(search = "", mount = true) {
  const dom = new JSDOM(renderCompare(catalog), { url: `https://example.test/compare/${search}` });
  const root = dom.window.document.querySelector("[data-compare-root]");
  if (mount) mountCompare(root, JSON.parse(root.querySelector("#catalog-data").textContent));
  return { dom, root, doc: dom.window.document };
}
const visibleSlugs = (root, selector) => [...root.querySelectorAll(selector)].filter(el => !el.hidden).map(el => el.dataset.product);

test("query state drops unknown and duplicate values with deterministic key order", () => {
  const state = parseCompareState("?bogus=x&series=thor,unknown&series=thor,agx-orin&type=developer-kit,bad&industrial=no&status=new,new&compare=a,a,b,missing", valid);
  assert.deepEqual(state.series, ["thor", "agx-orin"]);
  assert.deepEqual(state.compare, ["a", "b"]);
  assert.equal(serializeCompareState(state), "?series=thor%2Cagx-orin&type=developer-kit&status=new&compare=a%2Cb");
  assert.deepEqual(parseCompareState("?memory=bogus&power=bogus&useCase=bogus&industrial=0", catalog.products), empty());
});

test("query state restores every filter and announces comparison overflow", () => {
  const query = new URLSearchParams({ series: "agx-orin", type: "industrial-module", memory: "64 GB 256-bit LPDDR5（支持 ECC）", power: "15–75 W", industrial: "1", useCase: "工业自动化", status: "contact-sales" });
  const state = parseCompareState(`?${query}`, catalog.products);
  assert.deepEqual(state, { ...empty(), series: ["agx-orin"], types: ["industrial-module"], memory: ["64 GB 256-bit LPDDR5（支持 ECC）"], power: ["15–75 W"], industrial: true, useCases: ["工业自动化"], status: ["contact-sales"] });
  assert.deepEqual([...new URLSearchParams(serializeCompareState(state)).keys()], ["series", "type", "memory", "power", "industrial", "useCase", "status"]);
  const overflow = parseCompareState("?compare=a,b,c,d,e", valid);
  assert.deepEqual(overflow.compare, ["a", "b", "c", "d"]);
  assert.match(overflow.message, /最多比较 4 款/);
});

test("filters use OR within a field and AND across fields while retaining catalog order", () => {
  const state = { ...empty(), series: ["thor", "agx-orin"], types: ["production-module"] };
  assert.deepEqual(applyFilters(catalog.products, state).map(p => p.slug), ["jetson-t5000", "jetson-t4000", "jetson-agx-orin-64gb", "jetson-agx-orin-32gb"]);
  for (const filter of [{ industrial: true }, { memory: ["64 GB 256-bit LPDDR5（支持 ECC）"] }, { power: ["15–75 W"] }, { useCases: ["工业自动化"] }]) {
    assert.deepEqual(applyFilters(catalog.products, { ...empty(), ...filter }).map(p => p.slug), ["jetson-agx-orin-industrial"]);
  }
  assert.deepEqual(applyFilters(catalog.products, { ...empty(), status: ["new"] }), []);
  assert.deepEqual(applyFilters(catalog.products, empty()), catalog.products);
});

test("fifth comparison is rejected without mutating state and removal creates a new state", () => {
  const original = Object.freeze({ ...empty(), compare: Object.freeze(["a", "b", "c", "d"]) });
  const result = toggleComparedProduct(original, "e");
  assert.equal(result.state, original);
  assert.match(result.message, /最多比较 4 款/);
  assert.deepEqual(toggleComparedProduct(original, "b").state.compare, ["a", "c", "d"]);
  assert.deepEqual(toggleComparedProduct(empty(), "a").state.compare, ["a"]);
});

test("static matrix includes all twelve products and equivalent accessible mobile cards without JavaScript", () => {
  const { dom, root, doc } = page("", false);
  for (const selector of [".matrix-table tbody tr", ".matrix-card"]) {
    assert.deepEqual(visibleSlugs(root, selector), catalog.products.map(p => p.slug));
    for (const product of catalog.products) {
      const item = [...root.querySelectorAll(selector)].find(el => el.dataset.product === product.slug);
      for (const value of [product.nameZh, ...product.coreMetrics.slice(0, 3).map(m => m.value), ...product.useCases, product.specGroups.flatMap(g => g.rows).find(r => r.label === "GPU").value]) assert.ok(item.textContent.includes(value), value);
      assert.ok(item.querySelector(`a[href="/products/${product.slug}/"]`));
      assert.ok([...item.querySelectorAll("a")].some(link => link.getAttribute("href") === `/support/?product=${product.slug}&intent=quote`));
      assert.ok(item.querySelector("[data-toggle-compare]"));
    }
  }
  assert.match(root.querySelector("noscript").textContent, /下方仍列出全部产品/);
  assert.ok(doc.querySelector('script[type="module"][src="/assets/client/compare.js"]'));
  assert.deepEqual([...new Set([...root.querySelectorAll("form input")].map(input => input.name))], ["series", "type", "memory", "power", "industrial", "useCase", "status"]);
  for (const input of root.querySelectorAll("form input")) assert.ok(input.labels.length && input.labels[0].textContent.trim());
  dom.window.close();
});

test("mounted filters update desktop and mobile output, counts and URL; reset clears filters and selection", () => {
  const { dom, root } = page();
  root.querySelector('input[name="series"][value="thor"]').click();
  const expected = ["jetson-agx-thor-developer-kit", "jetson-t5000", "jetson-t4000"];
  assert.deepEqual(visibleSlugs(root, ".matrix-table tbody tr"), expected);
  assert.deepEqual(visibleSlugs(root, ".matrix-card"), expected);
  assert.equal(root.querySelector("[data-result-count]").textContent, "3");
  assert.equal(dom.window.location.search, "?series=thor");
  root.querySelector('[data-toggle-compare="jetson-t5000"]').click();
  root.querySelector('[type="reset"]').click();
  assert.equal(root.querySelector("[data-result-count]").textContent, "12");
  assert.equal(root.querySelector("[data-selected-count]").textContent, "0");
  assert.equal(dom.window.location.search, "");
  assert.ok([...root.querySelectorAll("form input")].every(input => !input.checked));
  root.querySelector('input[name="status"][value="new"]').click();
  assert.equal(root.querySelector("[data-empty-results]").hidden, false);
  dom.window.close();
});

test("mount restores URL selections, normalizes query, and shows full grouped specifications in data order", () => {
  const { dom, root } = page("?unknown=x&compare=jetson-agx-orin-industrial,jetson-t5000,jetson-t5000,bogus&series=agx-orin,unknown");
  assert.equal(dom.window.location.search, "?series=agx-orin&compare=jetson-agx-orin-industrial%2Cjetson-t5000");
  assert.equal(root.querySelector('input[name="series"][value="agx-orin"]').checked, true);
  assert.equal(root.querySelector("[data-selected-count]").textContent, "2");
  const panel = root.querySelector("[data-comparison-panel]");
  assert.equal(panel.hidden, false);
  const selected = [catalog.products[1], catalog.products[5]];
  for (const product of selected) for (const group of product.specGroups) {
    const section = [...panel.querySelectorAll("[data-spec-group]")].find(el => el.dataset.specGroup === group.title);
    assert.ok(section);
    const column = section.querySelector(`[data-spec-product="${product.slug}"]`);
    assert.deepEqual([...column.querySelectorAll("dt")].map(el => el.textContent), group.rows.map(row => row.label));
    assert.deepEqual([...column.querySelectorAll("dd")].map(el => el.textContent), group.rows.map(row => row.value));
  }
  assert.deepEqual([...panel.querySelectorAll("[data-spec-group]")[0].querySelectorAll("[data-spec-product]")].map(el => el.dataset.specProduct), selected.map(p => p.slug));
  assert.match(panel.textContent, /不同计算口径不可直接按数值比较/);
  dom.window.close();
});

test("four selections, rejected fifth, and keyboard-accessible removal preserve state and URL", () => {
  const { dom, root, doc } = page();
  for (const p of catalog.products.slice(0, 4)) root.querySelector(`[data-toggle-compare="${p.slug}"]`).click();
  const before = dom.window.location.href;
  root.querySelector(`[data-toggle-compare="${catalog.products[4].slug}"]`).click();
  assert.equal(dom.window.location.href, before);
  assert.equal(root.querySelector("[data-selected-count]").textContent, "4");
  assert.match(root.querySelector('[role="status"][aria-live="polite"]').textContent, /最多比较 4 款/);
  const remove = root.querySelector("[data-remove-compare]");
  assert.equal(remove.tagName, "BUTTON");
  remove.focus();
  assert.equal(doc.activeElement, remove);
  remove.click();
  assert.equal(root.querySelector("[data-selected-count]").textContent, "3");
  assert.ok(!dom.window.location.search.includes(catalog.products[0].slug));
  assert.ok(doc.activeElement.matches("[data-remove-compare]"));
  root.querySelector(`[data-toggle-compare="${catalog.products[4].slug}"]`).click();
  assert.equal(root.querySelector("[data-selected-count]").textContent, "4");
  dom.window.close();
});

test("filter drawer closes on Escape and close button with focus returning to trigger", () => {
  const { dom, root, doc } = page();
  const trigger = root.querySelector("[data-filter-trigger]");
  const drawer = doc.getElementById(trigger.getAttribute("aria-controls"));
  assert.equal(trigger.tagName, "BUTTON");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  trigger.click();
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(drawer.hidden, false);
  assert.ok(drawer.contains(doc.activeElement));
  doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(drawer.hidden, true);
  assert.equal(doc.activeElement, trigger);
  trigger.click();
  root.querySelector("[data-filter-close]").click();
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(doc.activeElement, trigger);
  dom.window.close();
});

test("oversized comparison links are explicitly reported and cleaned on mount", () => {
  const slugs = catalog.products.slice(0, 5).map(p => p.slug);
  const { dom, root } = page(`?compare=${slugs.join(",")}`);
  assert.equal(root.querySelector("[data-selected-count]").textContent, "4");
  assert.match(root.querySelector('[role="status"]').textContent, /最多比较 4 款/);
  assert.ok(!dom.window.location.search.includes(slugs[4]));
  dom.window.close();
});

test("repeated mount leaves one drawer toggle and preserves an already open drawer", () => {
  const { dom, root } = page();
  const products = JSON.parse(root.querySelector("#catalog-data").textContent);
  mountCompare(root, products);
  const trigger = root.querySelector("[data-filter-trigger]");
  trigger.click();
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(root.querySelector("[data-filter-drawer]").hidden, false);
  mountCompare(root, products);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  trigger.click();
  assert.equal(root.querySelector("[data-filter-drawer]").hidden, true);
  dom.window.close();
});

test("repeated mount causes no URL write and one selection writes history only once", () => {
  const { dom, root } = page();
  const original = dom.window.history.replaceState.bind(dom.window.history);
  let writes = 0;
  dom.window.history.replaceState = (...args) => { writes++; return original(...args); };
  mountCompare(root, JSON.parse(root.querySelector("#catalog-data").textContent));
  assert.equal(writes, 0);
  root.querySelector('[data-toggle-compare="jetson-t5000"]').click();
  assert.equal(writes, 1);
  assert.equal(dom.window.location.search, "?compare=jetson-t5000");
  assert.equal(root.querySelector("[data-selected-count]").textContent, "1");
  dom.window.close();
});

test("repeated mount does not resurrect a removed selection on the next addition", () => {
  const { dom, root } = page();
  mountCompare(root, JSON.parse(root.querySelector("#catalog-data").textContent));
  root.querySelector('[data-toggle-compare="jetson-t5000"]').click();
  root.querySelector('[data-toggle-compare="jetson-t4000"]').click();
  root.querySelector('[data-remove-compare="jetson-t5000"]').click();
  root.querySelector('[data-toggle-compare="jetson-agx-orin-64gb"]').click();
  assert.equal(dom.window.location.search, "?compare=jetson-t4000%2Cjetson-agx-orin-64gb");
  assert.equal(root.querySelector("[data-selected-count]").textContent, "2");
  assert.equal(root.querySelector('[data-remove-compare="jetson-t5000"]'), null);
  assert.equal(root.querySelector('[data-spec-product="jetson-t5000"]'), null);
  assert.ok([...root.querySelectorAll('[data-toggle-compare="jetson-t5000"]')].every(el => el.getAttribute("aria-pressed") === "false"));
  dom.window.close();
});

test("public catalog JSON whitelists nested UI fields and preserves script-safe display values", () => {
  const injected = structuredClone(catalog);
  const unsafe = '</script><script id="injected-script">alert(1)</script>';
  for (const product of injected.products) {
    product.internalField = "private product";
    for (const metric of product.coreMetrics) Object.assign(metric, { internalField: "private metric", sourceReference: "private source", verifiedAt: "2099-01-01" });
    for (const group of product.specGroups) {
      group.internalField = "private group";
      for (const row of group.rows) row.internalField = "private row";
    }
  }
  injected.products[0].specGroups[0].rows[0].value = unsafe;
  const dom = new JSDOM(renderCompare(injected));
  const script = dom.window.document.querySelector("#catalog-data");
  const products = JSON.parse(script.textContent);
  for (const product of products) {
    assert.deepEqual(Object.keys(product).sort(), ["coreMetrics", "nameZh", "productType", "series", "slug", "specGroups", "status", "useCases"]);
    for (const metric of product.coreMetrics) assert.deepEqual(Object.keys(metric).sort(), ["label", "value"]);
    for (const group of product.specGroups) {
      assert.deepEqual(Object.keys(group).sort(), ["rows", "title"]);
      for (const row of group.rows) assert.deepEqual(Object.keys(row).sort(), ["label", "value"]);
    }
  }
  assert.doesNotMatch(script.textContent, /sourceReference|verifiedAt|internalField|<\/script>/);
  assert.equal(products[0].specGroups[0].rows[0].value, unsafe);
  assert.equal(dom.window.document.querySelector("#injected-script"), null);
  dom.window.close();
});

async function supportPage(search = "") {
  const { renderSupport } = await import("../templates/support.mjs");
  const { mountFeedback } = await import("../src/client/feedback.js");
  const contact = { isSimulation: true, manager: "示例客户经理", phone: "400-000-0000", email: "sales@example.invalid", workHours: "工作日 9:00–18:00", qrPlaceholder: "二维码示例占位（不可扫描）" };
  const dom = new JSDOM(renderSupport({ contact, catalog }), { url: `https://example.test/support/${search}` });
  const root = dom.window.document.querySelector("[data-feedback-root]");
  return { dom, root, mountFeedback };
}

test("support query accepts a known product and quote intent; unknown or malicious values stay generic", async () => {
  for (const [query, expected] of [
    ["?product=jetson-agx-orin-64gb&intent=quote", "当前产品：Jetson AGX Orin 64GB · 报价咨询（示例）"],
    ["?product=jetson-agx-orin-64gb&intent=%3Cimg%20src=x%3E", "当前产品：Jetson AGX Orin 64GB · 支持咨询（示例）"],
    ["?product=missing&intent=quote", "通用支持咨询（示例）"],
    ["?product=%3Cimg%20src=x%20onerror=alert(1)%3E&intent=quote", "通用支持咨询（示例）"],
    ["?product=__proto__&intent=quote", "通用支持咨询（示例）"],
    ["", "通用支持咨询（示例）"],
  ]) {
    const { dom, root, mountFeedback } = await supportPage(query);
    mountFeedback(root);
    assert.equal(root.querySelector("[data-support-context]").textContent, expected);
    assert.equal(root.querySelector('img[src="x"]'), null);
    if (query.startsWith("?product=jetson-agx-orin-64gb")) assert.equal(root.querySelector("[data-support-product-link]").getAttribute("href"), "/products/jetson-agx-orin-64gb/");
    else assert.equal(root.querySelector("[data-support-product-link]").hidden, true);
    mountFeedback(root);
    assert.equal(root.querySelector("[data-support-context]").textContent, expected);
    dom.window.close();
  }
});

test("copy success gives visible polite feedback, restores at 2000ms and remains idempotent across mounts", async t => {
  const { dom, root, mountFeedback } = await supportPage();
  t.after(() => dom.window.close());
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const copied = [];
  Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async text => { copied.push(text); } } });
  mountFeedback(root); mountFeedback(root);
  const button = root.querySelector('[data-copy="400-000-0000"]');
  const original = button.textContent;
  button.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(copied, ["400-000-0000"]);
  assert.equal(button.textContent, "已复制");
  assert.match(root.querySelector('[data-copy-status][aria-live="polite"]').textContent, /已复制.*模拟/);
  t.mock.timers.tick(1999);
  assert.equal(button.textContent, "已复制");
  mountFeedback(root);
  t.mock.timers.tick(1);
  assert.equal(button.textContent, original);
  root.querySelector('[data-copy="sales@example.invalid"]').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(copied, ["400-000-0000", "sales@example.invalid"]);
});

test("copy failure and unavailable clipboard expose recovery and preserve phone and email anchors", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const clipboard of [undefined, { writeText: async () => { throw new Error("permission denied"); } }]) {
    const { dom, root, mountFeedback } = await supportPage();
    Object.defineProperty(dom.window.navigator, "clipboard", { value: clipboard });
    mountFeedback(root);
    const button = root.querySelector("[data-copy]");
    const original = button.textContent;
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(button.textContent, /复制失败/);
    assert.match(root.querySelector("[data-copy-status]").textContent, /手动复制/);
    assert.ok(root.querySelector('a[href="tel:400-000-0000"]'));
    assert.ok(root.querySelector('a[href="mailto:sales@example.invalid"]'));
    t.mock.timers.tick(2000);
    assert.equal(button.textContent, original);
    dom.window.close();
  }
});

test("download filters restore known product query, combine product and type, and reset to all records", async () => {
  const { renderDownloads } = await import("../templates/downloads.mjs");
  const { mountFeedback } = await import("../src/client/feedback.js");
  const fixture = [
    { id: "one", product: "jetson-agx-orin-64gb", type: "数据手册", version: "待发布", publishedAt: null, size: null, status: "preparing", href: null, sourceReference: "orin-spec" },
    { id: "two", product: "jetson-agx-orin-64gb", type: "软件工具", version: "待发布", publishedAt: null, size: null, status: "preparing", href: null, sourceReference: "jetpack" },
    { id: "three", product: "jetson-t5000", type: "软件工具", version: "待发布", publishedAt: null, size: null, status: "preparing", href: null, sourceReference: "jetpack" },
  ];
  const dom = new JSDOM(renderDownloads({ downloads: fixture, catalog }), { url: "https://example.test/downloads/?product=jetson-agx-orin-64gb" });
  const root = dom.window.document.querySelector("[data-feedback-root]");
  const visible = () => [...root.querySelectorAll("[data-download-id]")].filter(el => !el.hidden).map(el => el.dataset.downloadId);
  assert.deepEqual(visible(), ["one", "two", "three"]);
  mountFeedback(root); mountFeedback(root);
  assert.deepEqual(visible(), ["one", "two"]);
  const type = root.querySelector('[name="type"]');
  type.value = "软件工具";
  type.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.deepEqual(visible(), ["two"]);
  const product = root.querySelector('[name="product"]');
  product.value = "jetson-t5000";
  product.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  type.value = "数据手册";
  type.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.deepEqual(visible(), []);
  assert.match(root.querySelector("[data-download-status]").textContent, /没有匹配/);
  root.querySelector("[data-download-reset]").click();
  assert.deepEqual(visible(), ["one", "two", "three"]);
  dom.window.close();
  const unknown = new JSDOM(renderDownloads({ downloads: fixture, catalog }), { url: "https://example.test/downloads/?product=bad&type=bad" });
  mountFeedback(unknown.window.document.querySelector("[data-feedback-root]"));
  assert.equal(unknown.window.document.querySelectorAll("[data-download-id][hidden]").length, 0);
  unknown.window.close();
});
