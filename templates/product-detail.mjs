import { escapeHtml as e } from "../scripts/lib/html.mjs";
import { formatPerformance } from "../scripts/lib/products.mjs";
import { renderLayout } from "./layout.mjs";
import { productTypeLabels, statusLabels, renderProductImage, renderProductCard } from "./products.mjs";

const list = items => `<ul>${items.map(item => `<li>${e(item)}</li>`).join("")}</ul>`;

function section(id, title, content) {
  return content ? `<section class="section container detail-section" id="${id}" aria-labelledby="${id}-heading"><div class="section-heading"><h2 id="${id}-heading">${title}</h2></div>${content}</section>` : "";
}

function renderSpecifications(product, sources) {
  return product.specGroups.filter(group => group.rows.length).map(group => `<div class="spec-group"><table class="spec-table">
    <caption>${e(group.title)}</caption>
    <tbody>${group.rows.map(row => {
      const source = sources.get(row.sourceReference);
      return `<tr><th scope="row">${e(row.label)}</th><td><span class="spec-value">${e(row.value)}</span><details class="spec-evidence"><summary>来源与核验</summary><a href="${e(source.url)}">${e(source.title)}</a><span>核验于 <time datetime="${e(row.verifiedAt)}">${e(row.verifiedAt)}</time></span></details></td></tr>`;
    }).join("")}</tbody>
  </table></div>`).join("");
}

function renderSeriesComparison(product, catalog) {
  const siblings = catalog.products.filter(item => item.series === product.series);
  if (siblings.length < 2) return "";
  return `<p class="section-intro">同系列开发套件与模组并列展示，按项目的开发、集成与部署需求选择。</p>
    <div class="comparison-scroll" role="region" aria-label="同系列参数比较，可横向滚动" tabindex="0"><table class="series-comparison-table">
    <caption class="sr-only">同系列产品核心参数</caption><thead><tr><th scope="col">产品 / 类型</th><th scope="col">AI 性能与计算口径</th><th scope="col">核心配置</th><th scope="col">选型</th></tr></thead>
    <tbody>${siblings.map(item => `<tr data-product="${e(item.slug)}"${item.slug === product.slug ? ' class="current-product"' : ""}>
      <th scope="row"><a href="/products/${e(item.slug)}/">${e(item.nameZh)}</a><small>${productTypeLabels[item.productType]}${item.slug === product.slug ? " · 当前产品" : ""}</small></th>
      <td>${item.performanceMetrics.map(metric => `<p>${e(formatPerformance(metric))}</p>`).join("")}</td>
      <td><dl>${item.coreMetrics.filter(metric => metric.label !== "AI 性能").map(metric => `<div><dt>${e(metric.label)}</dt><dd>${e(metric.value)}${metric.note ? `<small>${e(metric.note)}</small>` : ""}</dd></div>`).join("")}</dl></td>
      <td><a class="text-link" href="/compare/?compare=${encodeURIComponent(product.slug === item.slug ? product.slug : `${product.slug},${item.slug}`)}">${product.slug === item.slug ? "加入对比" : "对比此款"}<span class="sr-only">：${e(item.nameZh)}</span></a></td>
    </tr>`).join("")}</tbody></table></div>
    <p class="metric-notice">性能包含精度、稀疏性与功耗口径；不同计算口径不可直接按数值比较。</p>`;
}

function renderResources(product, sources) {
  if (!product.documents.length && !product.downloads.length && !product.softwareSupport.length) return "";
  const quickStart = product.productType === "developer-kit"
    ? product.specGroups.flatMap(group => group.rows).find(row => row.label === "快速开始")?.sourceReference
    : null;
  const cards = (ids, label) => ids.map(id => {
    const source = sources.get(id);
    return `<a class="resource-card" href="${e(source.url)}"${id === quickStart ? ' data-quick-start="true"' : ""}><p class="eyebrow">${id === quickStart ? "快速开始" : label}</p><h3>${e(source.title)} <span aria-hidden="true">↗</span></h3><p>${e(source.publisher)} 官方资料 · 核验于 <time datetime="${e(source.checkedAt)}">${e(source.checkedAt)}</time></p></a>`;
  }).join("");
  return `${product.softwareSupport.length ? `<div class="software-support"><h3>软件支持</h3>${list(product.softwareSupport)}</div>` : ""}
    <div class="resource-grid">${cards(product.documents, "技术文档")}${cards(product.downloads, "软件下载")}</div>
    <div class="actions"><a class="text-link" href="/docs/?product=${encodeURIComponent(product.slug)}">浏览技术文档 →</a><a class="text-link" href="/downloads/?product=${encodeURIComponent(product.slug)}">前往下载中心 →</a></div>`;
}

function renderPurchasing(product, quoteUrl) {
  const partNumber = product.specGroups.flatMap(group => group.rows).find(row => row.label === "官方料号")?.value ?? product.officialPartNumber;
  return `<div class="purchasing-grid"><div><dl class="purchase-facts"><div><dt>供货状态</dt><dd>${statusLabels[product.status]}</dd></div>${partNumber ? `<div><dt>官方料号</dt><dd>${e(partNumber)}</dd></div>` : ""}${product.internalSku ? `<div><dt>内部 SKU（示例）</dt><dd>${e(product.internalSku)}</dd></div>` : ""}</dl><p class="metric-notice">报价、库存、交期与采购配置请向客户经理确认。</p><a class="button" href="${e(quoteUrl)}">获取报价</a></div>
    ${product.packageContents.length ? `<div id="package-contents"><h3>包装内容</h3>${list(product.packageContents)}</div>` : ""}
    ${product.optionalAccessories.length ? `<div id="optional-accessories"><h3>可选配件</h3>${list(product.optionalAccessories)}</div>` : ""}</div>`;
}

export function renderProductDetail({ product, related, catalog }) {
  const series = catalog.series.find(item => item.slug === product.series);
  const sources = new Map(catalog.sources.map(source => [source.id, source]));
  const quoteUrl = `/support/?product=${encodeURIComponent(product.slug)}&intent=quote`;
  const breadcrumb = `<nav class="container breadcrumb" aria-label="面包屑"><ol><li><a href="/">首页</a></li><li><a href="/products/">产品中心</a></li><li><a href="/products/#${e(series.slug)}">${e(series.name)}</a></li><li aria-current="page">${e(product.nameZh)}</li></ol></nav>`;
  const overview = `<section class="detail-overview container" id="product-overview" aria-labelledby="product-title"><div class="detail-hero"><div><p class="eyebrow">${e(series.name)}</p><div class="card-meta"><span class="product-type">${productTypeLabels[product.productType]}</span><span class="status-badge status-${e(product.status)}">${statusLabels[product.status]}</span></div><h1 id="product-title">${e(product.nameZh)}</h1><p class="product-english-name" lang="en">${e(product.nameEn)}</p><p class="lead">${e(product.shortPositioning)}</p></div>${renderProductImage(product, "detail-visual", "eager")}</div>
    <dl class="core-metrics detail-metrics">${product.coreMetrics.map(metric => `<div><dt>${e(metric.label)}</dt><dd><span class="metric-value">${e(metric.value)}</span>${metric.note ? `<small>${e(metric.note)}</small>` : ""}</dd></div>`).join("")}</dl>
    <div class="actions"><a class="button" href="${e(quoteUrl)}">获取报价</a><a class="button button-secondary" href="/support/?product=${encodeURIComponent(product.slug)}">联系销售</a><a class="button button-secondary" href="#specifications">查看技术规格</a></div></section>`;
  const body = breadcrumb + overview
    + section("highlights", "产品亮点", product.highlights.length ? `<ul class="highlights-grid">${product.highlights.map((text, i) => `<li><span class="highlight-number" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><p>${e(text)}</p></li>`).join("")}</ul>` : "")
    + section("use-cases", "应用场景", product.useCases.length ? `<ul class="detail-use-cases">${product.useCases.map(text => `<li>${e(text)}</li>`).join("")}</ul>` : "")
    + section("specifications", "技术规格", renderSpecifications(product, sources))
    + section("series-comparison", "同系列比较", renderSeriesComparison(product, catalog))
    + section("technical-resources", "技术资料", renderResources(product, sources))
    + section("purchasing", "采购信息", renderPurchasing(product, quoteUrl))
    + section("related-products", "关联产品", related.length ? `<div class="product-grid">${related.map(renderProductCard).join("")}</div>` : "");
  return renderLayout({ title: `${product.nameZh} · 产品详情`, description: product.shortPositioning, route: `/products/${product.slug}/`, body, styles: ["/assets/styles/products.css"], noscript: "产品规格、资料链接与询价入口无需 JavaScript 即可使用。" });
}
