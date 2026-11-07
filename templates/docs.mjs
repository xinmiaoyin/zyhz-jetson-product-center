import { escapeHtml as e } from "../scripts/lib/html.mjs";
import { renderLayout } from "./layout.mjs";

const docLink = document => `<a href="${e(document.url)}">${e(document.title)}</a>`;
function search(catalog) {
  return `<section class="doc-search" data-doc-search aria-label="本地搜索"><form role="search"><label for="doc-query">搜索产品与技术文档</label><div class="search-controls"><input id="doc-query" type="search" name="q" placeholder="例如：AGX Orin、系统刷写" aria-describedby="search-status" aria-controls="search-results"><button class="button button-small" type="submit">搜索</button><button class="button button-small button-secondary" data-search-clear type="button">清除</button></div></form><p id="search-status" role="status" aria-live="polite">输入关键词，或按下方目录浏览。</p><ul id="search-results" data-search-results></ul><div data-search-guidance><span>按系列选型：</span>${catalog.series.map(series => `<a href="/products/#${e(series.slug)}">${e(series.name)}</a>`).join("")}</div></section>`;
}
function layout({ title, description, route, body }) {
  return renderLayout({ title, description, route, body, styles: ["/assets/styles/docs.css"], scripts: ["/assets/client/search.js"], noscript: "文档正文、来源与目录均可直接阅读；只有动态搜索需要 JavaScript。" });
}

export function renderDocsIndex({ documents, catalog }) {
  const body = `<div class="container docs-index"><header class="docs-heading"><p class="eyebrow">TECHNICAL DOCUMENTS</p><h1>技术文档</h1><p class="lead">从产品资料到部署准备，辅助您核对适用条件。选型和采购可先查看产品参数，操作步骤以对应版本的官方资料为准。</p><div class="actions"><a class="text-link" href="/products/">浏览产品中心 →</a><a class="text-link" href="/compare/">比较产品配置 →</a></div></header>${search(catalog)}<div data-doc-list>${catalog.series.map(series => `<section class="docs-series" aria-labelledby="docs-${e(series.slug)}"><h2 id="docs-${e(series.slug)}">${e(series.name)}</h2><div class="docs-card-grid">${catalog.products.filter(p => p.series === series.slug).map(product => `<section class="docs-card"><h3>${e(product.nameZh)}</h3><ul>${documents.filter(d => d.product === product.slug).map(d => `<li>${docLink(d)}<p class="muted">${e(d.summary)}</p></li>`).join("")}</ul></section>`).join("")}</div></section>`).join("")}</div></div>`;
  return layout({ title: "Jetson 技术文档", description: "按 Jetson 产品查阅官方资料、快速开始、系统刷写和接口适配准备说明。", route: "/docs/", body });
}

export function renderDocumentPage({ document, navigation, catalog }) {
  const product = catalog.products.find(p => p.slug === document.product);
  const siblings = navigation.filter(d => d.product === document.product);
  const index = siblings.findIndex(d => d.url === document.url);
  const sources = document.sourceReferences.map(id => catalog.sources.find(source => source.id === id));
  const body = `<div class="container"><div class="docs-breadcrumb"><a href="/docs/">技术文档</a><span aria-hidden="true"> / </span><a href="/products/${e(product.slug)}/">${e(product.nameZh)}</a></div>${search(catalog)}<div class="docs-layout"><nav class="docs-sidebar" aria-label="文档导航"><h2>产品文档</h2>${catalog.products.map(p => `<details${p.slug === document.product ? " open" : ""}><summary>${e(p.nameZh)}</summary><ul>${navigation.filter(d => d.product === p.slug).map(d => `<li><a href="${e(d.url)}"${d.url === document.url ? ' aria-current="page"' : ""}>${e(d.title)}</a></li>`).join("")}</ul></details>`).join("")}</nav><div class="doc-main"><header class="docs-heading"><p class="eyebrow">${e(product.nameEn)}</p><h1>${e(document.title)}</h1><p class="lead">${e(document.summary)}</p><a class="text-link doc-product-back" href="/products/${e(product.slug)}/">查看产品参数与采购咨询 →</a></header><article class="doc-article" aria-label="文档正文">${document.html}</article><section class="doc-sources" data-document-sources aria-labelledby="sources-heading"><h2 id="sources-heading">官方来源</h2><ul>${sources.map(source => `<li><a href="${e(source.url)}" rel="noopener noreferrer">${e(source.title)}</a></li>`).join("")}</ul></section><nav class="doc-pagination" aria-label="相邻文档">${index > 0 ? `<a rel="prev" href="${e(siblings[index - 1].url)}">← 上一篇：${e(siblings[index - 1].title)}</a>` : ""}${index < siblings.length - 1 ? `<a rel="next" href="${e(siblings[index + 1].url)}">下一篇：${e(siblings[index + 1].title)} →</a>` : ""}</nav></div><nav class="doc-toc" aria-label="本文目录"><h2>本文目录</h2><ul>${document.headings.map(h => `<li class="toc-level-${h.depth}"><a href="#${e(h.id)}">${e(h.text)}</a></li>`).join("")}</ul></nav></div></div>`;
  return layout({ title: document.title, description: document.summary, route: document.url, body });
}
