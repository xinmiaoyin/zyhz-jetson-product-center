import { escapeHtml as e } from "../scripts/lib/html.mjs";
import { renderLayout } from "./layout.mjs";
import { productTypeLabels, statusLabels } from "./products.mjs";
import { filterOptions } from "../src/client/compare.js";

export function renderCompare(catalog) {
  const comparable = catalog.products.filter(product => product.performanceMetrics?.length);
  const otherProducts = catalog.products.filter(product => !product.performanceMetrics?.length);
  const options = filterOptions(comparable);
  const seriesNames = Object.fromEntries(catalog.series.map(series => [series.slug, series.name]));
  const filters = [["series", "产品系列", seriesNames], ["type", "产品形态", productTypeLabels], ["memory", "内存配置", {}], ["power", "模组功耗配置", {}], ["industrial", "工业要求", {}], ["useCase", "推荐应用", {}], ["status", "供货状态", statusLabels]];
  const rowsFor = product => {
    const metrics = Object.fromEntries(product.coreMetrics.map(metric => [metric.label, metric.value]));
    const specs = product.specGroups.flatMap(group => group.rows);
    const temperature = specs.find(row => row.label === "工作温度")?.value ?? "工作温度请查阅规格或咨询";
    return [
      ["系列", seriesNames[product.series]], ["产品形态", productTypeLabels[product.productType]],
      ["AI 性能及口径", metrics["AI 性能"]], ["GPU 架构", specs.find(row => row.label === "GPU")?.value ?? "见详情"],
      ["内存", metrics["内存"]], ["模组功耗", metrics["功耗"]],
      ["工业 / 温度", `${product.productType === "industrial-module" ? "工业模组" : "非工业模组"}；${temperature}`],
      ["推荐应用", product.useCases.join("、")], ["供货状态", statusLabels[product.status]],
    ];
  };
  const actions = product => `<div class="matrix-actions"><a href="/products/${e(product.slug)}/">查看详情<span class="sr-only">：${e(product.nameZh)}</span></a>${product.performanceMetrics?.length ? `<button type="button" data-toggle-compare="${e(product.slug)}" aria-pressed="false" aria-label="加入对比：${e(product.nameZh)}">加入对比</button>` : ""}<a href="/support/?product=${encodeURIComponent(product.slug)}&amp;intent=quote">询价<span class="sr-only">：${e(product.nameZh)}</span></a></div>`;
  const publicProducts = comparable.map(({ slug, series, nameZh, productType, status, coreMetrics, useCases, specGroups }) => ({
    slug, series, nameZh, productType, status, useCases,
    coreMetrics: coreMetrics.map(({ label, value }) => ({ label, value })),
    specGroups: specGroups.map(({ title, rows }) => ({ title, rows: rows.map(({ label, value }) => ({ label, value })) })),
  }));
  const body = `<div class="container compare-page" data-compare-root>
    <div class="page-heading"><p class="eyebrow">PRODUCT SELECTOR</p><h1>Jetson 产品矩阵与对比</h1><p class="lead">筛选具备可比较性能数据的产品，选择最多四款逐组核对规格。</p><p class="metric-notice">性能保留精度、稀疏性与功耗口径；不同计算口径不可直接按数值比较。模组功耗不等于整机输入功率，供货与交期请咨询。</p></div>
    <noscript>筛选、动态比较和链接分享需要启用 JavaScript；下方仍列出全部产品。</noscript>
    <div class="compare-toolbar"><button class="button button-secondary" type="button" data-filter-trigger aria-expanded="false" aria-controls="compare-filters" hidden>筛选产品</button><p>找到 <strong data-result-count>${comparable.length}</strong> 款产品 · 已选 <strong data-selected-count>0</strong> / 4 款</p><a class="text-link" href="#comparison-panel">查看规格对比 ↓</a></div>
    <div id="compare-filters" class="filter-drawer" data-filter-drawer><div class="filter-heading"><h2>筛选条件</h2><button type="button" data-filter-close hidden>收起筛选</button></div><form data-filter-form><div class="filter-grid">${filters.map(([key, title, labels]) => `<fieldset><legend>${title}</legend>${key === "industrial" ? '<label><input type="checkbox" name="industrial" value="1">仅工业模组</label>' : options[key].map((value, index) => `<label for="filter-${key}-${index}"><input id="filter-${key}-${index}" type="checkbox" name="${key}" value="${e(value)}">${e(labels[value] ?? value)}</label>`).join("")}</fieldset>`).join("")}</div><button class="button button-secondary" type="reset">重置筛选与对比</button></form></div>
    <p class="comparison-status" role="status" aria-live="polite" aria-atomic="true">选择产品开始比较，最多 4 款。</p>
    <aside class="compare-selection" aria-label="已选产品"><ul data-compare-tray></ul><p class="muted">选择和筛选会保存在地址栏，可复制当前链接分享。</p></aside>
    <p data-empty-results hidden>没有符合条件的产品，请调整条件或重置筛选。</p>
    ${comparable.length ? `<div class="matrix-table-wrap"><table class="matrix-table"><caption>性能比较矩阵 · 按产品目录顺序</caption><thead><tr><th scope="col">产品</th>${rowsFor(comparable[0]).map(([label]) => `<th scope="col">${label}</th>`).join("")}<th scope="col">操作</th></tr></thead><tbody>${comparable.map(product => `<tr data-product="${e(product.slug)}"><th scope="row"><a href="/products/${e(product.slug)}/">${e(product.nameZh)}</a></th>${rowsFor(product).map(([, value]) => `<td>${e(value)}</td>`).join("")}<td>${actions(product)}</td></tr>`).join("")}</tbody></table></div>
    <div class="matrix-cards" aria-label="性能比较矩阵">${comparable.map(product => `<article class="matrix-card product-card" data-product="${e(product.slug)}"><h2><a href="/products/${e(product.slug)}/">${e(product.nameZh)}</a></h2><dl>${rowsFor(product).map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>${actions(product)}</article>`).join("")}</div>` : ""}
    <section id="comparison-panel" class="comparison-panel" data-comparison-panel aria-labelledby="comparison-title" hidden></section>
    ${otherProducts.length ? `<section id="other-products" class="other-products" aria-labelledby="other-products-heading">
      <div class="section-heading"><h2 id="other-products-heading">整机与载板选型</h2></div>
      <div class="product-grid">${otherProducts.map(product => `<article class="product-card"><p class="product-type">${e(productTypeLabels[product.productType])}</p><h3>${e(product.nameZh)}</h3><p class="positioning">${e(product.shortPositioning)}</p>${actions(product)}</article>`).join("")}</div>
    </section>` : ""}
    <script type="application/json" id="catalog-data">${JSON.stringify(publicProducts).replaceAll("<", "\\u003c")}</script>
    <script type="module" src="/assets/client/compare.js"></script>
  </div>`;
  return renderLayout({ title: "Jetson 产品矩阵与规格对比", description: "筛选具备可比较性能数据的 Jetson 开发套件与模组，查阅整机与载板详情并咨询采购。", route: "/compare/", body, styles: ["/assets/styles/products.css"] });
}
