# 正阳恒卓整机与载板产品目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 6 款正阳恒卓整机与载板产品完整加入 Jetson 产品中心的目录、详情页和采购咨询流程。

**Architecture:** 扩展现有单一产品目录模型，使 NVIDIA 产品继续接受严格的官方来源与性能字段校验，同时允许第一方整机/载板使用本地图片和本地手册证据。渲染层根据产品类别隐藏不适用的性能比较与软件下载区域，构建层把手册和图片作为静态资源发布。

**Tech Stack:** Node.js 22、ES modules、Zod 4、静态 HTML 模板、Node test runner、JSDOM

**Spec:** `docs/superpowers/specs/2026-11-04-zyhz-systems-catalog-design.md`

## Global Constraints

- 只新增已确认成品的 MI‑12x4、MI‑19x2、MI‑19x3、MI‑11x8、MI‑13x8 和 C1201。
- 新增系列名固定为“正阳恒卓整机与载板”，排在现有四个 NVIDIA 系列之后。
- 页面和构建产物不得出现“隐溪科技”。
- 现有 12 款 NVIDIA 产品的官方来源、性能口径与路由必须保持兼容。
- 所有新产品必须提供带产品上下文的采购咨询入口。

## Review Focus

- 第一方本地资源路径不得放宽 NVIDIA 产品必须使用官方 HTTPS 来源的限制；Task 1 增加交叉校验测试。
- 缺失、越界或空的手册/图片资源必须在写入 `dist` 前使构建失败；Task 3 增加资源完整性测试。
- 整机或载板没有标准 TOPS 数据时不得伪造性能字段；Task 1 测试可选性能模型。
- 仅一个产品的系列不得渲染空比较表，整机系列也不应出现 NVIDIA 性能排名；Task 2 覆盖条件渲染。
- 支持页和查询参数必须识别新增 slug，且不能改变原有产品的询价链接；Task 3 做全路由检查。

---

### Task 1: 扩展产品目录模型并录入六款产品

**Files:**
- Modify: `scripts/lib/products.mjs`
- Modify: `data/series.json`
- Modify: `data/sources.json`
- Modify: `data/products.json`
- Test: `tests/products.test.mjs`

**Interfaces:**
- Consumes: 六份已确认单文件手册中的名称、规格与型号。
- Produces: `loadCatalog(rootDir)` 返回 18 款产品、5 个系列；第一方产品使用 `edge-computer` 或 `carrier-board` 类型和安全的站内资源路径。

- [ ] **Step 1: 写失败测试**：断言 18 个唯一 slug、第五系列顺序、6 个目标型号、第一方类型、可选性能字段及本地来源；同时断言 NVIDIA 产品使用本地图片或非 NVIDIA 来源时被拒绝。
- [ ] **Step 2: 运行 `node --test tests/products.test.mjs`**，确认因系列/类型/产品数量限制失败。
- [ ] **Step 3: 扩展 Zod 模型**：按产品归属区分 NVIDIA 与第一方的 URL、来源、性能和类型约束，不降低 NVIDIA 分支校验。
- [ ] **Step 4: 从六份手册录入目录数据**：每款提供四项核心指标、亮点、应用场景、规格分组、相关产品和手册来源。
- [ ] **Step 5: 运行 `node --test tests/products.test.mjs`**，确认目录校验全部通过。
- [ ] **Step 6: 提交**：`git commit -m "feat: add ZYHZ systems to product catalog"`。

### Task 2: 调整目录卡片与详情页渲染

**Files:**
- Modify: `templates/products.mjs`
- Modify: `templates/product-detail.mjs`
- Modify: `templates/compare.mjs`
- Modify: `src/styles/products.css`
- Test: `tests/rendering.test.mjs`
- Test: `tests/interactions.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `edge-computer`、`carrier-board`、本地手册来源与可选 `performanceMetrics`。
- Produces: 新系列目录区、六个统一详情页、适用的同系列比较行为和完整手册入口。

- [ ] **Step 1: 写失败测试**：检查第五系列 6 张卡片、产品类型标签、本地图片、详情章节顺序、手册入口、询价 URL，以及整机/载板不出现不适用的 NVIDIA 性能比较内容。
- [ ] **Step 2: 运行 `node --test tests/rendering.test.mjs tests/interactions.test.mjs`**，确认新产品渲染断言失败。
- [ ] **Step 3: 更新目录和详情模板**：为两种新类型增加中文标签，条件渲染性能、资源和比较区域，并保持所有用户文本 HTML 转义。
- [ ] **Step 4: 更新比较页**：只让具备可比较性能数据的产品进入性能比较，其他产品提供详情与询价路径。
- [ ] **Step 5: 补充响应式样式**：确保第五系列卡片和本地产品图在桌面及移动端布局稳定。
- [ ] **Step 6: 运行渲染与交互测试**，确认通过。
- [ ] **Step 7: 提交**：`git commit -m "feat: render ZYHZ system product pages"`。

### Task 3: 发布本地图片、手册并完成全站验收

**Files:**
- Create: `assets/products/<slug>/hero.*`（6 款产品）
- Create: `assets/manuals/<slug>.html`（6 份单文件手册）
- Modify: `scripts/build.mjs`
- Modify: `scripts/check-built-site.mjs`
- Modify: `tests/build.test.mjs`
- Modify: `tests/content.test.mjs`

**Interfaces:**
- Consumes: 原始手册位于 `D:/jetson/sites/zhengyanghengzhuo-*/`；Task 1 数据中的站内资源路径。
- Produces: `dist/assets/products/...` 和 `dist/assets/manuals/...`，18 个产品详情路由及可部署静态站点。

- [ ] **Step 1: 写失败测试**：断言 18 个详情路由、6 份非空手册、6 张可解码图片、无工作区绝对路径、无“隐溪科技”，并验证每个询价链接的产品 slug。
- [ ] **Step 2: 运行 `node --test tests/build.test.mjs tests/content.test.mjs`**，确认缺少新资源与路由时失败。
- [ ] **Step 3: 提取并加入产品主图**：从已确认手册的内嵌图片提取适合卡片展示的首图，保存到各产品资源目录。
- [ ] **Step 4: 复制六份单文件手册**：保存为稳定英文 slug 文件名，并在构建前校验品牌残留和文件非空。
- [ ] **Step 5: 更新构建与产物检查**：复制和验证本地静态资源，动态计算路由数量，不保留固定 12/33 等旧数量假设。
- [ ] **Step 6: 运行 `npm run check`**，期望所有测试、构建和静态产物检查通过。
- [ ] **Step 7: 启动预览并检查 `/products/`、一款边缘计算盒详情、一款载板详情及 `/support/` 的询价上下文。
- [ ] **Step 8: 提交**：`git commit -m "feat: publish ZYHZ manuals and product media"`。

