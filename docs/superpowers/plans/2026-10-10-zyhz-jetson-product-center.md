# 正阳恒卓 Jetson 产品中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成一个面向正阳恒卓客户、可浏览十二款 Jetson 产品、筛选对比、查看技术资料并联系客户经理的私有预览站点。

**Architecture:** 使用 Node.js 静态生成器读取唯一的产品 JSON、来源 JSON 与 Markdown 文档，生成无需服务端和数据库的独立 HTML 路由。原生客户端 JavaScript 只负责产品筛选、最多四款对比、URL 状态、文档搜索和操作反馈；无 JavaScript 时仍可阅读首页、产品详情和文档。发布采用 Sites 静态目录 `dist/`，先生成私有预览。

**Tech Stack:** Node.js 22.13+、原生 ESM、Node test runner、Zod、Marked、sanitize-html、原生 HTML/CSS/JavaScript、Sites static hosting

**Spec:** `docs/superpowers/specs/2026-10-10-zyhz-jetson-product-center-design.md`

## Global Constraints

- 首版只包含规格中的十二款 Jetson 产品和四个产品系列。
- 网站核心任务是产品浏览、选型、比较和采购咨询；安装、刷机、接口与支持是辅助内容。
- 所有产品事实优先来自 NVIDIA 官方资料；公司 SKU、供货与服务字段只能来自正阳恒卓提供的信息。
- 不发布未经核验的参数、价格、库存、交期、客户案例或认证。
- AI 性能必须显示数值、单位、精度、稀疏性、功耗模式、来源和核验日期；不得把 FP4、FP8、INT8 混成单一排名。
- 产品 JSON 是卡片、矩阵、详情页和同系列比较的唯一数据源；技术文档使用 Markdown。
- 必填字段缺失、重复 slug、错误关联和失效内部链接必须使检查失败；可选字段缺失时隐藏相应内容。
- 页面不得暴露空值或未标识的模拟信息；无真实下载文件时显示“资料准备中”且不生成空链接。
- 客户经理数据使用明确标记的模拟内容，正式客户版本发布前集中替换。
- 产品比较最多四款，筛选和比较状态写入可复制的 URL 参数。
- 首版不实现账号、在线支付、数据库、后台管理、在线编辑、多语言或真实询价提交。
- 使用正阳恒卓已确认 Logo；视觉采用白色、浅灰绿、Logo 青蓝和深灰文字，不使用大面积渐变、霓虹或无意义动画。
- 桌面、平板、手机均须可用；交互支持键盘和明显焦点，不以颜色作为唯一状态信号。
- 首版通过 Sites 发布为私有预览。

## Review Focus

- URL 中出现未知筛选值、重复产品或不存在的 slug 时，应忽略无效项、保留有效项，并输出规范化可分享 URL；由 Task 5 的查询状态测试覆盖。
- 用户已选择四款产品后再添加第五款时，应保持原选择与 URL 不变，并通过可感知状态消息解释限制；由 Task 5 的交互测试覆盖。
- Thor 与 Orin 同时出现时，每个性能值都应保留精度和稀疏性标签，且页面不得生成跨精度性能名次；由 Task 3 和 Task 5 的数据/渲染测试覆盖。
- 可选规格、产品图片或下载文件缺失时，应分别隐藏空规格、显示带产品名的图片回退、显示不可点击的“资料准备中”；由 Task 4 和 Task 7 的测试覆盖。
- JavaScript 关闭或加载失败时，首页、产品详情和基础文档仍应可读，动态工具应有 `noscript` 说明；由 Task 4、Task 5 和 Task 6 的生成 HTML 测试覆盖。

---

## Planned File Map

```text
.
├── .openai/hosting.json                 # Sites 静态托管声明和后续 project_id
├── assets/brand/zyhz-logo.png           # 已确认公司 Logo 的站内副本
├── content/docs/<product-slug>/*.md     # 按产品组织的技术文档正文
├── data/contact.json                    # 明确标记为模拟的客户经理数据
├── data/downloads.json                  # 下载项、版本、文件状态
├── data/products.json                   # 十二款产品的唯一事实数据源
├── data/series.json                     # 四个产品系列的名称、顺序和说明
├── data/sources.json                    # 官方来源登记和最后核验日期
├── scripts/build.mjs                    # 全站构建入口
├── scripts/check-built-site.mjs         # 生成结果、内部链接和禁用内容检查
├── scripts/dev-server.mjs               # 本地静态预览服务器
├── scripts/lib/assets.mjs               # 复制静态资产及生成图片回退资源
├── scripts/lib/content.mjs              # Markdown 读取、净化、目录和搜索索引
├── scripts/lib/html.mjs                 # HTML 转义、URL 和通用标签帮助函数
├── scripts/lib/products.mjs             # Zod schema、关联校验和产品查询
├── scripts/lib/site.mjs                 # 路由清单、页面写入和 sitemap
├── src/client/compare.js                # 筛选、选择、URL 同步和移动端矩阵
├── src/client/feedback.js               # 复制、跳转和状态反馈
├── src/client/search.js                 # 浏览器内文档搜索
├── src/styles/base.css                  # 设计令牌、排版、焦点和通用组件
├── src/styles/docs.css                  # 文档目录、代码块和提示样式
├── src/styles/products.css              # 卡片、矩阵、规格与响应式比较
├── templates/compare.mjs                # 完整矩阵和对比页
├── templates/docs.mjs                   # 文档首页和正文页
├── templates/downloads.mjs              # 下载中心
├── templates/home.mjs                   # 首页
├── templates/layout.mjs                 # 品牌导航、页脚、元数据和脚本注入
├── templates/product-detail.mjs         # 产品详情和同系列比较
├── templates/products.mjs               # 产品中心与系列入口
├── templates/support.mjs                # 支持与采购联系页
├── tests/build.test.mjs                 # 路由、链接、静态降级与构建失败测试
├── tests/content.test.mjs               # Markdown、目录和搜索索引测试
├── tests/interactions.test.mjs          # jsdom 交互、上限和 URL 状态测试
├── tests/products.test.mjs              # 数据 schema、关系和性能口径测试
└── tests/rendering.test.mjs             # 首页、详情、下载、无障碍输出测试
```

### Task 1: 建立可测试的静态生成骨架

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `.openai/hosting.json`
- Create: `scripts/build.mjs`
- Create: `scripts/dev-server.mjs`
- Create: `scripts/lib/html.mjs`
- Create: `scripts/lib/site.mjs`
- Create: `tests/build.test.mjs`

**Interfaces:**
- Consumes: Node.js 22.13+；项目根目录作为构建工作目录。
- Produces: `escapeHtml(value: unknown): string`、`writePage({ route, html, outDir }): Promise<string>`、`buildSite({ rootDir, outDir }): Promise<{ routes: string[] }>`。

- [ ] **Step 1: 写入包脚本和首个失败测试**

```json
{
  "name": "zyhz-jetson-product-center",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.13" },
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "build": "node scripts/build.mjs",
    "check": "npm test && npm run build && node scripts/check-built-site.mjs",
    "dev": "node scripts/dev-server.mjs"
  }
}
```

```js
// tests/build.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escapeHtml } from "../scripts/lib/html.mjs";
import { writePage } from "../scripts/lib/site.mjs";

test("escapeHtml protects generated markup", () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
});

test("writePage creates directory-style routes", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "zyhz-site-"));
  await writePage({ route: "/products/agx-orin-64gb/", html: "<h1>AGX Orin 64GB</h1>", outDir });
  assert.match(await readFile(join(outDir, "products/agx-orin-64gb/index.html"), "utf8"), /AGX Orin 64GB/);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `npm test`

Expected: FAIL，提示 `scripts/lib/html.mjs` 或 `scripts/lib/site.mjs` 不存在。

- [ ] **Step 3: 安装并锁定最小依赖**

Run: `npm install --save-exact zod marked sanitize-html && npm install --save-dev --save-exact jsdom`

Expected: 生成 `package-lock.json`，`npm ls --depth=0` 无缺失依赖。

- [ ] **Step 4: 实现 HTML 与静态路由基础函数**

```js
// scripts/lib/html.mjs
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// scripts/lib/site.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function routeToFile(route, outDir) {
  const clean = route.replace(/^\/+|\/+$/g, "");
  return join(outDir, clean, "index.html");
}

export async function writePage({ route, html, outDir }) {
  const file = routeToFile(route, outDir);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, html, "utf8");
  return file;
}
```

Add `scripts/build.mjs` with an exported `buildSite({ rootDir, outDir })` that clears only the resolved project `dist/`, writes an initial `/` route, and writes a route manifest. Add a Node HTTP server in `scripts/dev-server.mjs` that serves `dist/`, maps directory paths to `index.html`, returns `404` for missing files, and prints `http://127.0.0.1:4173/`.

- [ ] **Step 5: 添加托管声明与忽略规则**

```json
// .openai/hosting.json
{
  "project_id": null,
  "static": { "directory": "dist" }
}
```

`.gitignore` must contain `node_modules/`, `dist/`, `.DS_Store`, and `.superpowers/`.

- [ ] **Step 6: 运行测试和最小构建**

Run: `npm test && npm run build`

Expected: tests PASS；`dist/index.html` 和 `dist/routes.json` 存在。

- [ ] **Step 7: 提交骨架**

```bash
git add package.json package-lock.json .gitignore .openai scripts tests/build.test.mjs
git commit -m "build: add static site generator foundation"
```

### Task 2: 建立十二款产品的受校验事实数据

**Files:**
- Create: `data/products.json`
- Create: `data/series.json`
- Create: `data/sources.json`
- Create: `scripts/lib/products.mjs`
- Create: `tests/products.test.mjs`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: `data/*.json` 和官方来源登记。
- Produces: `loadCatalog(rootDir): Promise<{ products: Product[], series: Series[], sources: Source[] }>`、`getProduct(slug, catalog): Product`、`getRelatedProducts(product, catalog): Product[]`、`formatPerformance(metric): string`。

- [ ] **Step 1: 为产品数量、slug、关联和性能口径写失败测试**

```js
// tests/products.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, formatPerformance } from "../scripts/lib/products.mjs";

test("catalog validates all twelve unique products", async () => {
  const catalog = await loadCatalog(process.cwd());
  assert.equal(catalog.products.length, 12);
  assert.equal(new Set(catalog.products.map((p) => p.slug)).size, 12);
  assert.deepEqual(new Set(catalog.products.map((p) => p.series)), new Set(["thor", "agx-orin", "orin-nx", "orin-nano"]));
});

test("every performance number carries comparison context", async () => {
  const { products } = await loadCatalog(process.cwd());
  for (const product of products) for (const metric of product.performanceMetrics) {
    assert.ok(metric.precision);
    assert.ok(metric.sparsity);
    assert.ok(metric.sourceReference);
    assert.match(formatPerformance(metric), new RegExp(metric.precision, "i"));
  }
});

test("all relationships and source references resolve", async () => {
  const { products, sources } = await loadCatalog(process.cwd());
  const slugs = new Set(products.map((p) => p.slug));
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const product of products) {
    product.relatedProducts.forEach((slug) => assert.ok(slugs.has(slug), `${product.slug} -> ${slug}`));
    product.sourceReferences.forEach((id) => assert.ok(sourceIds.has(id), `${product.slug} -> ${id}`));
  }
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="catalog|performance|relationships" tests/*.test.mjs`

Expected: FAIL，提示产品加载模块或数据文件不存在。

- [ ] **Step 3: 定义并实现精确 schema**

```js
// scripts/lib/products.mjs (core shape)
import { z } from "zod";

const performanceMetricSchema = z.object({
  label: z.string().min(1), value: z.number().positive(), unit: z.string().min(1),
  precision: z.enum(["FP4", "FP8", "FP16", "INT8"]),
  sparsity: z.enum(["dense", "sparse"]), powerMode: z.string().min(1),
  sourceReference: z.string().min(1), verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  series: z.enum(["thor", "agx-orin", "orin-nx", "orin-nano"]),
  nameZh: z.string().min(1), nameEn: z.string().min(1),
  productType: z.enum(["developer-kit", "production-module", "industrial-module"]),
  status: z.enum(["available", "new", "contact-sales"]),
  shortPositioning: z.string().min(12), heroImage: z.string().min(1),
  officialPartNumber: z.string().optional(), internalSku: z.string().optional(),
  coreMetrics: z.array(z.object({ label: z.string(), value: z.string(), note: z.string().optional() })).length(4),
  highlights: z.array(z.string().min(8)).min(4).max(6),
  useCases: z.array(z.string().min(1)).min(1),
  specGroups: z.array(z.object({ title: z.string(), rows: z.array(z.object({ label: z.string(), value: z.string() })).min(1) })).min(1),
  performanceMetrics: z.array(performanceMetricSchema),
  softwareSupport: z.array(z.string()), documents: z.array(z.string()), downloads: z.array(z.string()),
  packageContents: z.array(z.string()), optionalAccessories: z.array(z.string()),
  relatedProducts: z.array(z.string()), sourceReferences: z.array(z.string()).min(1),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), imageAlt: z.string().min(1)
});
```

Implement parsing, duplicate checks, source/relationship resolution, type-specific requirements, and `formatPerformance()` as a display string containing value, unit, precision, density and power mode.

- [ ] **Step 4: 调研并录入十二款产品**

Use `agent-reach` for web retrieval and restrict factual parameters to NVIDIA official product pages, datasheets, lifecycle pages and developer documentation. Enter the twelve exact product records from the spec, record every source in `data/sources.json` as `{ id, title, url, publisher, checkedAt }`, and use `2026-10-10` for `checkedAt`/`verifiedAt` only for sources actually checked during this task. Keep unknown optional fields absent; do not infer them.

Required series order in `data/series.json`:

```json
[
  { "slug": "thor", "name": "Jetson Thor", "order": 1 },
  { "slug": "agx-orin", "name": "Jetson AGX Orin", "order": 2 },
  { "slug": "orin-nx", "name": "Jetson Orin NX", "order": 3 },
  { "slug": "orin-nano", "name": "Jetson Orin Nano", "order": 4 }
]
```

- [ ] **Step 5: 让构建入口在生成页面前加载并校验数据**

`buildSite()` must call `loadCatalog(rootDir)` before writing any route. On validation failure, it must throw a message containing product slug, field path and validation reason, and must not leave a partially generated `dist/`.

- [ ] **Step 6: 运行数据测试**

Run: `node --test --test-name-pattern="catalog|performance|relationships" tests/*.test.mjs`

Expected: PASS for 12 products, unique slugs, resolved relationships, and contextual performance strings.

- [ ] **Step 7: 提交事实数据层**

```bash
git add data scripts/lib/products.mjs scripts/build.mjs tests/products.test.mjs
git commit -m "feat: add validated Jetson product catalog"
```

### Task 3: 实现品牌外壳、首页和产品中心

**Files:**
- Create: `assets/brand/zyhz-logo.png`
- Create: `scripts/lib/assets.mjs`
- Create: `templates/layout.mjs`
- Create: `templates/home.mjs`
- Create: `templates/products.mjs`
- Create: `src/styles/base.css`
- Create: `src/styles/products.css`
- Create: `tests/rendering.test.mjs`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: `Catalog` from `loadCatalog()`；已确认 Logo 源文件 `D:\jetson\tmp\pdfs\jetson_manual\logo_cropped.png`。
- Produces: `renderLayout({ title, description, route, body, styles, scripts }): string`、`renderHome(catalog): string`、`renderProductsIndex(catalog): string`、`copyAssets({ rootDir, outDir, products }): Promise<void>`。

- [ ] **Step 1: 写首页结构和静态降级的失败测试**

```js
// tests/rendering.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog } from "../scripts/lib/products.mjs";
import { renderHome } from "../templates/home.mjs";

test("home renders all series once and useful non-JS links", async () => {
  const html = renderHome(await loadCatalog(process.cwd()));
  for (const name of ["Jetson Thor", "Jetson AGX Orin", "Jetson Orin NX", "Jetson Orin Nano"])
    assert.equal((html.match(new RegExp(name, "g")) ?? []).length >= 1, true);
  assert.match(html, /href="\/compare\/"/);
  assert.match(html, /href="\/support\/"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /跳至主要内容/);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="home renders" tests/*.test.mjs`

Expected: FAIL，提示 `templates/home.mjs` 不存在。

- [ ] **Step 3: 准备品牌资产并实现统一页面外壳**

Before copying, compare the source file dimensions and SHA-256 so the operation is auditable. Copy the confirmed PNG byte-for-byte to `assets/brand/zyhz-logo.png`; `copyAssets()` copies it plus CSS/client assets into `dist/assets/` and generates one neutral SVG fallback per product at `/assets/product-fallbacks/<product-slug>.svg`, carrying the escaped product name.

`renderLayout()` must output: language `zh-CN`, unique title/description, skip link, logo with `alt="正阳恒卓科技"`, five primary nav links, `<main id="main-content">`, company footer, Jetson/NVIDIA trademark notice, stylesheet links, deferred scripts, and optional `noscript` content.

- [ ] **Step 4: 实现 C 方案精简首页与产品中心**

`renderHome()` must render in this exact order: compact hero, four series links, compact matrix preview, use-case links, docs/downloads links, sales-assistance CTA, company footer. `renderProductsIndex()` must group all products by series and expose product type, four metrics, status, details link, compare link and quote link. Avoid decorative gradients and repeated slogans.

- [ ] **Step 5: 编写设计令牌和响应式基础样式**

```css
/* src/styles/base.css */
:root {
  --brand-700: #087a89;
  --brand-600: #0a91a1;
  --brand-100: #dff4f1;
  --surface: #ffffff;
  --surface-muted: #f3f7f5;
  --text: #172321;
  --text-muted: #53635f;
  --border: #d8e2df;
  --focus: #005fcc;
  --radius: 10px;
  --content: 1180px;
}
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
```

Complete type scale, 8px spacing rhythm, buttons, cards, tables, status badges, header/footer and breakpoints at 960px and 680px. Status badges must include text, not color alone.

- [ ] **Step 6: 把页面接入构建并验证路由**

Generate `/`, `/products/`, and `/products/?series=<slug>`-compatible anchor targets. Run: `npm test && npm run build`

Expected: PASS；首页和产品中心均包含十二款数据中的正确系列入口，静态资产可从 `/assets/` 访问。

- [ ] **Step 7: 提交品牌和目录页面**

```bash
git add assets scripts/lib/assets.mjs templates src/styles scripts/build.mjs tests/rendering.test.mjs
git commit -m "feat: build branded catalog home and product index"
```

### Task 4: 生成产品详情页和同系列比较

**Files:**
- Create: `templates/product-detail.mjs`
- Modify: `src/styles/products.css`
- Modify: `scripts/build.mjs`
- Modify: `tests/rendering.test.mjs`

**Interfaces:**
- Consumes: `Product`, `getRelatedProducts(product, catalog)` and `formatPerformance(metric)` from Task 2.
- Produces: `renderProductDetail({ product, related, catalog }): string` and twelve `/products/<slug>/` pages.

- [ ] **Step 1: 写详情顺序、类型差异和缺失图片回退的失败测试**

```js
test("AGX Orin 64GB detail follows the approved sales-first order", async () => {
  const { loadCatalog, getRelatedProducts } = await import("../scripts/lib/products.mjs");
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  const catalog = await loadCatalog(process.cwd());
  const product = catalog.products.find((p) => p.slug === "jetson-agx-orin-64gb");
  const html = renderProductDetail({ product, related: getRelatedProducts(product, catalog), catalog });
  const headings = ["产品亮点", "应用场景", "技术规格", "同系列比较", "技术资料", "采购信息"];
  assert.deepEqual(headings.map((h) => html.indexOf(h)), [...headings.map((h) => html.indexOf(h))].sort((a, b) => a - b));
  assert.match(html, /获取报价/);
  assert.match(html, /onerror=.*product-image-fallback/);
});

test("performance output keeps precision context and has no cross-precision ranking", async () => {
  const { loadCatalog } = await import("../scripts/lib/products.mjs");
  const { renderProductDetail } = await import("../templates/product-detail.mjs");
  const catalog = await loadCatalog(process.cwd());
  const html = catalog.products.map((product) => renderProductDetail({ product, related: [], catalog })).join("\n");
  for (const product of catalog.products) for (const metric of product.performanceMetrics)
    assert.match(html, new RegExp(metric.precision, "i"));
  assert.doesNotMatch(html, /性能排名|第[一二三四]名/);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="detail|performance output" tests/*.test.mjs`

Expected: FAIL，提示详情模板不存在。

- [ ] **Step 3: 实现销售优先的详情模板**

Render: breadcrumb; family/name/type/status/positioning; image; exactly four core metrics; quote/contact/spec CTAs; four-to-six highlights; use cases; grouped specifications; same-series comparison; technical document cards; purchasing information; related products. Quote URL must be `/support/?product=<encoded-slug>&intent=quote`.

For developer kits, emphasize I/O, package contents and quick start. For production modules, emphasize connector, dimensions, power, lifecycle and carrier compatibility. For industrial modules, additionally render ECC, operating temperature, reliability and longevity rows when present. Thor products additionally render FP4/FP8, MIG and high-speed interconnect rows when present. Never render an empty `<section>`, heading or table.

- [ ] **Step 4: 加入图片和无 JavaScript 降级**

Every image must have `alt=product.imageAlt`, `loading="lazy"` below the fold, fixed width/height to prevent layout shift, and `onerror` that swaps exactly once to `/assets/product-fallbacks/<product-slug>.svg`. Each detail page must contain normal anchor links for all actions and readable spec tables without client scripts.

- [ ] **Step 5: 生成十二个详情路由并运行测试**

Run: `npm test && npm run build`

Expected: PASS；`dist/products/<each-slug>/index.html` exists for all twelve records, and no output contains empty spec groups.

- [ ] **Step 6: 提交详情页**

```bash
git add templates/product-detail.mjs src/styles/products.css scripts/build.mjs tests/rendering.test.mjs
git commit -m "feat: add product detail and series comparison pages"
```

### Task 5: 实现产品矩阵、筛选和最多四款对比

**Files:**
- Create: `templates/compare.mjs`
- Create: `src/client/compare.js`
- Create: `tests/interactions.test.mjs`
- Modify: `src/styles/products.css`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: serialized public product fields embedded as `<script type="application/json" id="catalog-data">`.
- Produces: `parseCompareState(search, validProducts): CompareState`、`serializeCompareState(state): string`、`applyFilters(products, state): Product[]`、`toggleComparedProduct(state, slug): { state, message }`、`mountCompare(root, products): void`.

- [ ] **Step 1: 写 URL 清洗、过滤和第五款阻止测试**

```js
// tests/interactions.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseCompareState, serializeCompareState, toggleComparedProduct } from "../src/client/compare.js";

const valid = new Set(["a", "b", "c", "d", "e"]);

test("query state drops unknown and duplicate product slugs", () => {
  const state = parseCompareState("?series=thor,unknown&compare=a,a,b,missing", valid);
  assert.deepEqual(state.series, ["thor"]);
  assert.deepEqual(state.compare, ["a", "b"]);
  assert.equal(serializeCompareState(state), "?series=thor&compare=a%2Cb");
});

test("fifth comparison is rejected without mutating state", () => {
  const original = { series: [], types: [], memory: [], power: [], industrial: false, useCases: [], status: [], compare: ["a", "b", "c", "d"] };
  const result = toggleComparedProduct(original, "e");
  assert.deepEqual(result.state.compare, original.compare);
  assert.match(result.message, /最多比较 4 款/);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="query state|fifth comparison" tests/*.test.mjs`

Expected: FAIL，提示比较客户端模块不存在。

- [ ] **Step 3: 实现纯状态函数和确定性 URL 格式**

`parseCompareState()` supports keys `series`, `type`, `memory`, `power`, `industrial`, `useCase`, `status`, and `compare`; unknown values are dropped, repeats are de-duplicated in first-seen order, and comparison truncation is never silent. `serializeCompareState()` emits keys in that order and omits empty defaults. `toggleComparedProduct()` removes selected items, adds up to four, and returns the exact user-facing limit message for a fifth item.

- [ ] **Step 4: 实现完整矩阵与渐进增强交互**

`renderCompare()` outputs all twelve products server-side as rows with: series, name, type, contextual AI performance, GPU architecture, memory, power, industrial/temperature, recommended use, status, detail/compare/quote actions. Include native form controls for every filter, reset button, result count, selected count, compare tray, `role="status" aria-live="polite"`, and `<noscript>筛选、动态比较和链接分享需要启用 JavaScript；下方仍列出全部产品。</noscript>`.

`mountCompare()` filters rows/cards, updates counts, syncs `history.replaceState`, prevents a fifth choice, restores selections on load, and renders a grouped comparison panel. Differences may be emphasized, but rows must remain in data order and performance values must not be numerically ranked across precision types.

- [ ] **Step 5: 实现移动端卡片矩阵和键盘行为**

At widths below 680px hide the wide table only after the equivalent accessible cards are present. Filter drawer uses a real `<button aria-expanded>` and returns focus to the trigger on close. Checkboxes retain visible labels; Escape closes the drawer; compare removal works with keyboard.

- [ ] **Step 6: 运行单元与 DOM 测试**

Add jsdom tests that mount the page, choose filters, add four items, attempt a fifth, remove one, reset, and verify both visible output and URL changes.

Run: `npm test && npm run build`

Expected: PASS；generated `/compare/` includes all products in static HTML and the client bundle.

- [ ] **Step 7: 提交矩阵和对比功能**

```bash
git add templates/compare.mjs src/client/compare.js src/styles/products.css scripts/build.mjs tests/interactions.test.mjs
git commit -m "feat: add filterable shareable product comparison"
```

### Task 6: 构建 Markdown 技术文档与本地搜索

**Files:**
- Create: `content/docs/<product-slug>/product-resources.md` for all twelve products
- Create: `content/docs/jetson-agx-orin-64gb/quick-start.md`
- Create: `content/docs/jetson-agx-orin-64gb/flashing-and-jetpack.md`
- Create: `content/docs/jetson-agx-orin-64gb/interfaces.md`
- Create: `scripts/lib/content.mjs`
- Create: `templates/docs.mjs`
- Create: `src/client/search.js`
- Create: `src/styles/docs.css`
- Create: `tests/content.test.mjs`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Consumes: Markdown front matter `{ title, product, order, summary, sourceReferences }` and the validated catalog/source IDs.
- Produces: `loadDocuments(rootDir, catalog): Promise<Document[]>`、`renderMarkdown(markdown): { html, headings }`、`buildSearchIndex(documents, products): SearchRecord[]`、`searchIndex(records, query): SearchRecord[]`、`renderDocsIndex({ documents, catalog }): string`、`renderDocumentPage({ document, navigation, catalog }): string`。

- [ ] **Step 1: 写 Markdown 安全性、来源和搜索测试**

```js
// tests/content.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog } from "../scripts/lib/products.mjs";
import { renderMarkdown, loadDocuments, buildSearchIndex } from "../scripts/lib/content.mjs";

test("markdown renders headings but removes executable markup", () => {
  const rendered = renderMarkdown("## 接口说明\n\n<script>alert(1)</script>\n\n```bash\nsudo reboot\n```");
  assert.match(rendered.html, /id="接口说明"/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /language-bash/);
});

test("documents resolve product and source references", async () => {
  const documents = await loadDocuments(process.cwd(), await loadCatalog(process.cwd()));
  assert.ok(documents.length >= 15);
  assert.ok(documents.every((doc) => doc.product && doc.sourceReferences.length));
});

test("search index finds product and document titles", async () => {
  const catalog = await loadCatalog(process.cwd());
  const records = buildSearchIndex(await loadDocuments(process.cwd(), catalog), catalog.products);
  assert.ok(records.some((record) => record.text.includes("AGX Orin 64GB")));
  assert.ok(records.some((record) => record.text.includes("系统刷写")));
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="markdown|documents|search index" tests/*.test.mjs`

Expected: FAIL，提示内容模块不存在。

- [ ] **Step 3: 实现受控 Markdown 管道**

Use Marked with heading IDs derived from Unicode-safe slugs, then sanitize with an allowlist for headings, paragraphs, lists, links, tables, code/pre, blockquote, strong/emphasis and callout classes. Reject front matter with unknown product/source IDs. External links get `rel="noopener noreferrer"`; commands remain copyable text, never executable controls.

- [ ] **Step 4: 编写首版文档内容**

For every product create `product-resources.md` linking only to verified official resources already registered in `data/sources.json`. For `jetson-agx-orin-64gb`, additionally create the three customer-facing sample documents named above, each containing safety/context notes, ordered steps, applicable versions and sources. Do not invent board-specific commands; when official instructions branch by host OS or JetPack version, present the branch explicitly.

- [ ] **Step 5: 实现文档导航和搜索**

Render `/docs/`, every `/docs/<product>/<document>/`, left product/document navigation, on-page table of contents, previous/next links, search box, empty-search guidance and link back to the relevant product. Build `dist/assets/search-index.json`; `search.js` loads it once, normalizes case/whitespace, ranks exact title hits before body hits, and shows product plus document type.

- [ ] **Step 6: 验证无 JavaScript 可读性**

Generated document pages must contain complete article HTML, source links and navigation before scripts run. `/docs/` includes a normal browsable index and a `noscript` note stating only dynamic search requires JavaScript.

- [ ] **Step 7: 运行内容和全站构建测试**

Run: `npm test && npm run build`

Expected: PASS；all Markdown routes and `dist/assets/search-index.json` are generated, and sanitized HTML contains no executable markup.

- [ ] **Step 8: 提交文档系统**

```bash
git add content scripts/lib/content.mjs templates/docs.mjs src/client/search.js src/styles/docs.css scripts/build.mjs tests/content.test.mjs
git commit -m "feat: add searchable Jetson technical documentation"
```

### Task 7: 完成下载中心、支持采购和操作反馈

**Files:**
- Create: `data/contact.json`
- Create: `data/downloads.json`
- Create: `templates/downloads.mjs`
- Create: `templates/support.mjs`
- Create: `src/client/feedback.js`
- Modify: `scripts/build.mjs`
- Modify: `tests/rendering.test.mjs`
- Modify: `tests/interactions.test.mjs`

**Interfaces:**
- Consumes: validated product slugs, download records and contact record.
- Produces: `renderDownloads({ downloads, catalog }): string`、`renderSupport({ contact, selectedProduct }): string`、`mountFeedback(root): void`。

- [ ] **Step 1: 写模拟标记、缺失下载和产品上下文测试**

```js
test("support page clearly labels simulated contact data", async () => {
  const { renderSupport } = await import("../templates/support.mjs");
  const html = renderSupport({
    contact: { isSimulation: true, manager: "示例客户经理", phone: "400-000-0000", email: "sales@example.invalid", workHours: "工作日 9:00–18:00" },
    selectedProduct: { nameEn: "Jetson AGX Orin 64GB", slug: "jetson-agx-orin-64gb" }
  });
  assert.match(html, /模拟联系信息/);
  assert.match(html, /Jetson AGX Orin 64GB/);
});

test("missing download is rendered as disabled preparation state", async () => {
  const { loadCatalog } = await import("../scripts/lib/products.mjs");
  const { renderDownloads } = await import("../templates/downloads.mjs");
  const catalog = await loadCatalog(process.cwd());
  const html = renderDownloads({ downloads: [{ id: "d1", product: "jetson-agx-orin-64gb", type: "数据手册", version: "1.0", publishedAt: "2026-10-10", size: null, status: "preparing", href: null }], catalog });
  assert.match(html, /资料准备中/);
  assert.doesNotMatch(html, /href=""/);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="simulated contact|missing download" tests/*.test.mjs`

Expected: FAIL，提示下载或支持模板不存在。

- [ ] **Step 3: 创建受校验的联系和下载数据**

`data/contact.json` must set `isSimulation: true` and use only the visible sample name, phone, `.invalid` email, work hours and a non-scannable labeled QR placeholder. `data/downloads.json` records `{ id, product, type, version, publishedAt, size, status, href, sourceReference }`; `status` is `available` only when `href` resolves to a real file or verified external resource.

- [ ] **Step 4: 实现下载中心和支持页**

Downloads support filters by product and type. Available records show version/date/size/source and a real link; preparing records show a disabled element with `aria-disabled="true"`. Support page reads `product` and `intent` from the URL, resolves only known slugs, displays the selected product context, provides phone/email/copy actions, and never sends a form or promises a response time beyond the sample data.

- [ ] **Step 5: 实现明确操作反馈**

`feedback.js` attaches to `[data-copy]`, copies only declared text, changes the button label to `已复制`, updates a polite live region, and restores the original label after 2000ms. Anchor navigation remains functional if the script fails. Add jsdom tests for copy success, copy failure, unknown product query and restored label.

- [ ] **Step 6: 生成路由并运行测试**

Run: `npm test && npm run build`

Expected: PASS；`/downloads/` and `/support/` exist, every quote link carries a valid product slug, and no preparing download has a clickable empty URL.

- [ ] **Step 7: 提交下载与支持流程**

```bash
git add data/contact.json data/downloads.json templates/downloads.mjs templates/support.mjs src/client/feedback.js scripts/build.mjs tests
git commit -m "feat: add downloads and sales support flow"
```

### Task 8: 全站检查、浏览器验收与 Sites 私有发布

**Files:**
- Create: `scripts/check-built-site.mjs`
- Modify: `tests/build.test.mjs`
- Modify: `.openai/hosting.json`
- Modify: documentation only if verification reveals a user-visible behavior that must be recorded

**Interfaces:**
- Consumes: complete `dist/`, route manifest, all internal anchors and assets.
- Produces: `checkBuiltSite({ rootDir, outDir }): Promise<{ pages: number, links: number }>` and a private Sites preview URL.

- [ ] **Step 1: 写全站检查失败测试**

```js
test("built site rejects broken internal links and leaked placeholders", async () => {
  const { mkdir, mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkBuiltSite } = await import("../scripts/check-built-site.mjs");
  const outDir = await mkdtemp(join(tmpdir(), "zyhz-check-"));
  await mkdir(join(outDir, "bad"), { recursive: true });
  await writeFile(join(outDir, "bad/index.html"), '<a href="/missing/">坏链接</a><p>' + "T" + "BD" + "</p>");
  await assert.rejects(() => checkBuiltSite({ rootDir: process.cwd(), outDir }), /missing|placeholder/i);
});
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `node --test --test-name-pattern="built site rejects" tests/*.test.mjs`

Expected: FAIL，提示全站检查模块不存在。

- [ ] **Step 3: 实现确定性的生成结果检查**

`checkBuiltSite()` must parse every generated HTML file and fail on: broken internal route/asset/fragment links; duplicate IDs; missing page title/H1/lang/description; images without alt/size; empty anchors; unmarked sample contact content; prohibited placeholder tokens; incorrect product count; missing `noscript` on interactive pages; product metric disagreement between data and rendered pages. External source links are checked separately with timeouts and reported as warnings so transient network errors do not corrupt the customer build.

- [ ] **Step 4: 运行完整自动检查**

Run: `npm run check`

Expected: all tests PASS, clean build succeeds, checker reports 12 product pages plus all index/document/support routes and zero broken internal links.

- [ ] **Step 5: 启动并打开可见本地预览**

Run in a retained session: `npm run dev`

Expected: server prints `http://127.0.0.1:4173/`; a direct request to `/products/jetson-agx-orin-64gb/` returns HTTP 200. Open the Local URL in the Codex browser and keep the server/session for the following edits.

- [ ] **Step 6: 完成桌面、平板和手机人工验收**

At 1440×900, 768×1024 and 390×844 verify: nav; homepage hierarchy; every series entry; AGX Orin 64GB detail; filter/reset/share URL; four-item limit; mobile cards; document search/no-result state; preparing download; quote context; copy feedback; broken-image fallback. Keyboard-only verify skip link, focus order, filter drawer, checkboxes and compare removal. Record screenshots or concise evidence for each viewport and fix every blocking issue before continuing.

- [ ] **Step 7: 创建并打包 Sites 私有预览**

Use the Sites native API to create the site as private. Write the returned project ID into `.openai/hosting.json`, then run the Sites workflow helper from the Sites plugin root to validate and package the repository with these commands in order:

```json
[
  ["npm", "test"],
  ["npm", "run", "build"],
  ["node", "scripts/check-built-site.mjs"]
]
```

Upload the packaged artifact with the native Sites publish API. Do not make it public in this task.

- [ ] **Step 8: 验证私有预览而不是只依赖上传成功**

Open the returned private preview, repeat homepage → AGX Orin 64GB → compare → support, verify assets load and routes survive direct navigation, then record the private preview URL and project ID in the handoff.

- [ ] **Step 9: 提交最终检查与托管配置**

```bash
git add scripts/check-built-site.mjs tests/build.test.mjs .openai/hosting.json
git commit -m "chore: verify and package private Sites preview"
```

## Final Verification Checklist

- [ ] `npm run check` exits 0 from a clean `dist/`.
- [ ] `git status --short` is clean after the final commit.
- [ ] Exactly twelve product records and twelve product detail routes exist.
- [ ] Every product fact shown in UI resolves to an approved source or clearly marked company/sample data.
- [ ] Homepage, product center, compare, docs, downloads and support routes work by direct URL.
- [ ] Four-product cap, URL sharing, search, copy feedback and no-result states were exercised in the browser.
- [ ] Desktop, tablet, mobile and keyboard-only checks have evidence.
- [ ] Sites preview remains private and uses the project ID stored in `.openai/hosting.json`.
- [ ] The user receives the private preview URL plus a concise list of fields still requiring final real company data.
