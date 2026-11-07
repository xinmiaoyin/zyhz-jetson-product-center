import { escapeHtml as e } from "../scripts/lib/html.mjs";

const navigation = [["/products/", "产品中心"], ["/compare/", "产品选型"], ["/docs/", "技术文档"], ["/downloads/", "下载中心"], ["/support/", "支持服务"]];

const normalizeBasePath = value => {
  const basePath = String(value ?? "").trim().replace(/\/+$/u, "");
  if (!basePath) return "";
  if (!/^\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/u.test(basePath)) throw new Error("SITE_BASE_PATH must be an absolute URL path without a trailing slash");
  return basePath;
};

const prefixRootRelativeUrls = (html, basePath) => basePath ? html.replace(/\b(href|src|action|data-fallback)="\/(?!\/)([^"]*)"/gu, (_match, attribute, rest) => `${attribute}="${basePath}/${rest}"`) : html;

export function renderLayout({ title, description, route, body, styles = [], scripts = [], noscript = "", basePath = process.env.SITE_BASE_PATH ?? "" }) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const html = `<!doctype html>
<html lang="zh-CN"${normalizedBasePath ? ` data-base-path="${e(normalizedBasePath)}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} | 正阳恒卓科技</title>
  <meta name="description" content="${e(description)}">
  ${[...new Set(["/assets/styles/base.css", ...styles])].map(href => `<link rel="stylesheet" href="${e(href)}">`).join("\n  ")}
  ${scripts.map(src => `<script type="module" src="${e(src)}" defer></script>`).join("\n  ")}
</head>
<body>
  <a class="skip-link" href="#main-content">跳至主要内容</a>
  <header class="site-header"><div class="container header-inner">
    <a class="brand" href="/" aria-label="正阳恒卓科技首页"><img src="/assets/brand/zyhz-logo.png" width="1570" height="963" alt="正阳恒卓科技"><span class="brand-divider" aria-hidden="true"></span><span class="brand-caption">Jetson 产品中心</span></a>
    <nav aria-label="主导航">${navigation.map(([href, label]) => `<a href="${href}"${route === href || route?.startsWith(href) ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  </div></header>
  <main id="main-content" tabindex="-1">${body}</main>
  ${noscript ? `<noscript><div class="container notice">${e(noscript)}</div></noscript>` : ""}
  <footer class="site-footer"><div class="container footer-inner"><div><p class="company-name">北京正阳恒卓科技有限公司</p><p>Jetson 产品 · 选型咨询 · 技术支持</p></div><div class="footer-legal"><p>© 北京正阳恒卓科技有限公司</p><p>NVIDIA 和 Jetson 是 NVIDIA Corporation 的商标或注册商标。产品图片由 NVIDIA 官方来源提供。</p></div></div></footer>
</body>
</html>\n`;
  return prefixRootRelativeUrls(html, normalizedBasePath);
}
