import { escapeHtml as e } from "../scripts/lib/html.mjs";
import { renderLayout } from "./layout.mjs";

export const productTypeLabels = { "developer-kit": "开发套件", "production-module": "量产模组", "industrial-module": "工业模组" };
export const statusLabels = { available: "可供货", new: "新品", "contact-sales": "供货请咨询" };

export function renderProductImage(product, className = "", loading = "lazy") {
  const fallback = `/assets/product-fallbacks/${product.slug}.svg`;
  const fallbackAlt = `${product.nameZh}，产品图片暂不可用`;
  return `<div class="product-visual ${e(className)}"><img class="product-image" src="${e(product.heroImage)}" data-fallback="${e(fallback)}" data-fallback-alt="${e(fallbackAlt)}" onerror="this.onerror=null;this.alt=this.dataset.fallbackAlt;this.src=this.dataset.fallback" alt="${e(product.imageAlt)}" width="640" height="400" loading="${e(loading)}" decoding="async"><noscript><img class="product-fallback" src="${e(fallback)}" alt="${e(fallbackAlt)}" width="640" height="400" loading="${e(loading)}"></noscript></div>`;
}

export function renderProductCard(product) {
  return `<article class="product-card" data-product="${e(product.slug)}">
    ${renderProductImage(product)}
    <div class="product-card-body">
      <div class="card-meta"><span class="product-type">${productTypeLabels[product.productType]}</span><span class="status-badge status-${e(product.status)}">${statusLabels[product.status]}</span></div>
      <h3><a href="/products/${e(product.slug)}/">${e(product.nameZh)}</a></h3>
      <p class="positioning">${e(product.shortPositioning)}</p>
      <dl class="core-metrics">${product.coreMetrics.map(metric => `<div><dt>${e(metric.label)}</dt><dd><span class="metric-value">${e(metric.value)}</span>${metric.note ? `<small>${e(metric.note)}</small>` : ""}</dd></div>`).join("")}</dl>
      <div class="card-actions"><a class="text-link" href="/products/${e(product.slug)}/">查看详情<span class="sr-only">：${e(product.nameZh)}</span> <span aria-hidden="true">↗</span></a><a href="/compare/?compare=${encodeURIComponent(product.slug)}">加入对比<span class="sr-only">：${e(product.nameZh)}</span></a><a class="button button-small button-secondary" href="/support/?product=${encodeURIComponent(product.slug)}&amp;intent=quote">询价<span class="sr-only">：${e(product.nameZh)}</span></a></div>
    </div>
  </article>`;
}

export function renderProductsIndex(catalog) {
  const body = `<div class="container page-heading"><p class="eyebrow">PRODUCT CATALOG</p><h1>Jetson 产品中心</h1><p class="lead">按系列浏览开发套件与模组，核对性能、内存与功耗，找到适合项目的配置。</p><div class="catalog-toolbar"><nav class="series-tabs" aria-label="产品系列">${catalog.series.map(series => `<a href="#${e(series.slug)}">${e(series.name)}</a>`).join("")}</nav><a class="text-link" href="/compare/">比较全部 ${catalog.products.length} 款产品 <span aria-hidden="true">→</span></a></div><p class="metric-notice">性能包含精度、稀疏性与功耗口径；不同计算口径不可直接按数值比较。供货与交期请咨询客户经理。</p></div>
  ${catalog.series.map(series => {
    const products = catalog.products.filter(product => product.series === series.slug);
    return `<section class="catalog-section container" id="${e(series.slug)}" aria-labelledby="heading-${e(series.slug)}"><div class="section-heading"><div><p class="eyebrow">SERIES ${String(series.order).padStart(2, "0")}</p><h2 id="heading-${e(series.slug)}">${e(series.name)}</h2></div><span class="muted">${products.length} 款产品</span></div><div class="product-grid">${products.map(renderProductCard).join("")}</div></section>`;
  }).join("")}`;
  return renderLayout({ title: "全部 Jetson 产品与系列", description: "浏览正阳恒卓 Jetson Thor、AGX Orin、Orin NX 和 Orin Nano 产品目录，核对核心参数、对比型号并咨询采购。", route: "/products/", body, styles: ["/assets/styles/products.css"], noscript: "全部产品和核心参数已列出，无需 JavaScript 即可浏览。动态筛选与对比需要启用 JavaScript。" });
}
