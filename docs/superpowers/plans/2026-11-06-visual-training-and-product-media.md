# 视觉实训设备与产品图片更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增视觉实训开发套件，清理 MI‑19x2 第三方品牌字样，并替换四款 NVIDIA 模组展示图。

**Architecture:** 产品目录继续以官方来源字段作为 NVIDIA 数据证据，同时用可选 `displayImage` 承载用户提供的本地展示图。第一方视觉实训设备沿用现有正阳恒卓产品详情与本地手册发布链路；图片编辑和目录变更在同一构建中验收。

**Tech Stack:** Node.js 22、ES modules、Zod 4、静态 HTML、Node test runner、JSDOM、ImageGen

**Spec:** `docs/superpowers/specs/2026-11-06-visual-training-and-product-media-design.md`

## Global Constraints

- MI‑19x2 只删除“隐溪科技 HCKdigi”，不添加任何品牌标识。
- 四张模组图片只替换同名型号，不扩散到其他产品。
- NVIDIA 官方 `heroImage`、来源和性能校验保持不变。
- 新产品使用 157 TOPS / 16GB / 2000 万像素 / ≥19 英寸口径，不使用冲突的 275 TOPS / AGX Orin 64GB 口径。
- 新产品手册不公开客户名称、采购数量、报价或投标信息。

## Review Focus

- `displayImage` 不得被 NVIDIA 产品用于绕过官方 `heroImage` 来源验证；Task 2 增加反例测试。
- 本地图片缺失、为空、越界、符号链接或损坏时必须在删除旧 `dist` 前失败；Task 3 扩展预检测试。
- MI‑19x2 编辑不得改变图像尺寸或残留可识别第三方字样；Task 1 做尺寸与视觉检查。
- 新产品不应进入 NVIDIA 性能矩阵，但必须进入第一方产品选型区；Task 2 覆盖渲染行为。
- 新手册不得泄露客户、采购或投标内容；Task 3 增加禁用文本检查。

---

### Task 1: 准备并校验产品图片

**Files:**
- Modify: `assets/products/mi-19x2/hero.png`
- Create: `assets/products/jetson-agx-orin-64gb/display.png`
- Create: `assets/products/jetson-orin-nx-16gb/display.png`
- Create: `assets/products/jetson-orin-nano-8gb/display.png`
- Create: `assets/products/jetson-t5000/display.png`
- Create: `assets/products/vision-training-kit/hero.png`

**Interfaces:**
- Consumes: 用户确认的 MI‑19x2 编辑要求、四张模组素材及北中医整机实拍。
- Produces: 六张可被 Task 2 数据引用的项目内 PNG 图片。

- [ ] **Step 1:** 使用 ImageGen 编辑 MI‑19x2，只移除指定文字并保持所有其他画面元素及原尺寸。
- [ ] **Step 2:** 逐张检查编辑结果；如仍有文字残留，只针对残留区域迭代一次。
- [ ] **Step 3:** 将四张模组图片按精确映射复制为 `display.png`，不得重采样或改配色。
- [ ] **Step 4:** 将“第二代.jpg”转换为无损 PNG 作为新产品主图，保持原始画面比例与内容。
- [ ] **Step 5:** 用图像解码器检查六张图片可解码、非空且 MI‑19x2 尺寸未变。

### Task 2: 扩展目录并渲染新产品

**Files:**
- Modify: `scripts/lib/products.mjs`
- Modify: `data/products.json`
- Modify: `data/sources.json`
- Modify: `templates/products.mjs`
- Modify: `templates/product-detail.mjs`
- Modify: `templates/compare.mjs`
- Test: `tests/products.test.mjs`
- Test: `tests/rendering.test.mjs`
- Test: `tests/interactions.test.mjs`

**Interfaces:**
- Consumes: Task 1 的图片路径。
- Produces: 19 款产品目录、`vision-training-system` 类型、可选 `displayImage` 及新详情页。

- [ ] **Step 1:** 写失败测试，断言 19 款产品、第五系列 7 款、`vision-training-kit` 的指标与询价入口，以及四款 NVIDIA 精确使用本地 `displayImage`。
- [ ] **Step 2:** 运行目录与渲染测试，确认因产品数量、类型和字段未实现而失败。
- [ ] **Step 3:** 扩展 Zod 模型：第一方增加 `vision-training-system`；NVIDIA 可选 `displayImage` 只接受安全站内图片，`heroImage` 仍为必需官方 HTTPS URL。
- [ ] **Step 4:** 录入新产品、来源、规格、亮点、应用场景和相关产品。
- [ ] **Step 5:** 更新卡片、详情与比较模板，新产品进入第一方选型区而非 NVIDIA 性能矩阵。
- [ ] **Step 6:** 运行目录、渲染与交互测试并确认通过。

### Task 3: 发布手册、强化预检并统一验收

**Files:**
- Create: `assets/manuals/vision-training-kit.html`
- Modify: `scripts/lib/local-product-assets.mjs`
- Modify: `scripts/check-built-site.mjs`
- Modify: `tests/build.test.mjs`
- Modify: `tests/content.test.mjs`

**Interfaces:**
- Consumes: Task 2 的产品与 `displayImage` 数据。
- Produces: 可部署的 19 款产品站点及新产品手册。

- [ ] **Step 1:** 写失败测试，覆盖新手册、六张新增/修改图片、19 个详情路由和禁用客户/投标文本。
- [ ] **Step 2:** 创建简洁的正阳恒卓产品手册，只使用获准的公开产品参数。
- [ ] **Step 3:** 让本地资产预检跟随 `heroImage`、`displayImage` 和产品实际引用文档，在清空 `dist` 前验证路径、链接组件、非空和图片解码。
- [ ] **Step 4:** 更新动态数量和构建断言，不保留固定 18/39 等旧假设。
- [ ] **Step 5:** 运行 `npm run check`，期望 0 失败。
- [ ] **Step 6:** 重启 `npm run dev`，验证 `/products/`、`/products/mi-19x2/`、`/products/vision-training-kit/` 均返回 200，并打开产品中心展示结果。

