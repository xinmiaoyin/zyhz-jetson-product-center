import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { escapeHtml as e } from "./html.mjs";
export { searchIndex } from "../../src/client/search.js";

const decodeText = text => text.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric, named) => numeric ? String.fromCodePoint(Number(numeric.startsWith("x") ? `0${numeric}` : numeric)) : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()]));
const plainText = html => decodeText(sanitizeHtml(html.replace(/<\/(?:p|h[1-6]|li|td|th|pre|blockquote)>/g, "$& "), { allowedTags: [], allowedAttributes: {} })).replace(/\s+/gu, " ").trim();

export function renderMarkdown(markdown) {
  const headings = [];
  const used = new Set(["main-content", "doc-query", "search-results", "search-status", "sources-heading"]);
  const marked = new Marked({ gfm: true });
  // Render first, then restrict the resulting HTML. No raw Markdown HTML bypasses this boundary.
  const sanitized = sanitizeHtml(marked.parse(markdown), {
    allowedTags: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "pre", "code", "blockquote", "strong", "em", "del", "br", "hr", "div", "span"],
    allowedAttributes: { h1: ["id"], h2: ["id"], h3: ["id"], h4: ["id"], h5: ["id"], h6: ["id"], a: ["href", "title", "rel"], ol: ["start"], code: ["class"], div: ["class"], blockquote: ["class"], span: ["class"] },
    allowedClasses: { code: [/^language-[\w-]+$/], div: ["callout", "note", "warning"], blockquote: ["callout", "note", "warning"], span: ["note", "warning"] },
    allowedSchemes: ["https"], allowProtocolRelative: false,
    transformTags: { a: (tagName, attribs) => {
      // Browsers remove ASCII tabs/newlines from URLs. Normalize before both the
      // scheme check and the later registered-source check; forbid backslash URLs.
      const href = (attribs.href ?? "").trim().replace(/[\t\n\r]/g, "");
      const allowed = !href.includes("\\") && (/^https:\/\//i.test(href) || /^\/(?!\/)/.test(href) || href.startsWith("#"));
      const safe = { ...attribs };
      delete safe.href;
      delete safe.rel;
      if (allowed) safe.href = href;
      if (allowed && /^https:/i.test(href)) safe.rel = "noopener noreferrer";
      return { tagName, attribs: safe };
    } },
  });
  // Normalize every sanitized heading, including raw HTML accepted by Markdown,
  // through one global namespace shared with the surrounding document template.
  const html = sanitized.replace(/<h([1-6])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (_match, depthText, inline) => {
    const depth = Number(depthText);
    const text = plainText(inline);
    const base = text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "section";
    let id = base;
    let count = 2;
    while (used.has(id)) id = `${base}-${count++}`;
    used.add(id);
    headings.push({ depth, id, text });
    return `<h${depth} id="${e(id)}">${inline}</h${depth}>`;
  });
  return { html, headings };
}

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const metadataSchema = z.object({
  title: z.string().trim().min(1), product: slugSchema, order: z.number().int().positive(),
  summary: z.string().trim().min(1), sourceReferences: z.array(z.string().min(1)).min(1),
}).strict();

function parseDocument(raw, path) {
  const match = raw.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${path}: missing front matter`);
  // Deliberately limited YAML: scalar strings/numbers and inline JSON arrays.
  // This avoids implicit dates, executable tags, aliases and surprising type coercion.
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const field = line.match(/^([a-zA-Z]+):\s*(.+)$/);
    if (!field || Object.hasOwn(values, field[1])) throw new Error(`${path}: invalid or duplicate front matter field`);
    const value = field[2].trim();
    try { values[field[1]] = /^["\[\d-]|^(?:true|false|null)$/.test(value) ? JSON.parse(value) : value; }
    catch { throw new Error(`${path}: invalid front matter ${field[1]}`); }
  }
  const result = metadataSchema.safeParse(values);
  if (!result.success) throw new Error(`${path}: front matter ${result.error.message}`);
  return { ...result.data, markdown: match[2] };
}

export async function loadDocuments(rootDir, catalog) {
  const root = join(rootDir, "content/docs");
  const documents = [];
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) throw new Error(`docs product directory expected: ${directory.name}`);
    for (const entry of await readdir(join(root, directory.name), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) throw new Error(`docs Markdown file expected: ${entry.name}`);
      const path = join(root, directory.name, entry.name);
      const document = parseDocument(await readFile(path, "utf8"), path);
      const product = catalog.products.find(product => product.slug === document.product);
      if (!product || directory.name !== document.product) throw new Error(`${path}: unknown or mismatched product ${document.product}`);
      const sources = document.sourceReferences.map(id => {
        const source = catalog.sources.find(source => source.id === id);
        if (!source) throw new Error(`${path}: unknown source ${id}`);
        return source;
      });
      const slug = slugSchema.parse(basename(entry.name, ".md"));
      const rendered = renderMarkdown(document.markdown);
      sanitizeHtml(rendered.html, { transformTags: { a: (tagName, attribs) => {
        if (/^https:/i.test(attribs.href ?? "") && !sources.some(source => source.url === attribs.href)) throw new Error(`${path}: external link must reference a declared source: ${attribs.href}`);
        return { tagName, attribs };
      } } });
      documents.push({ ...document, ...rendered, slug, url: `/docs/${document.product}/${slug}/`, text: plainText(rendered.html) });
    }
  }
  const order = new Map(catalog.products.map((p, i) => [p.slug, i]));
  return documents.sort((a, b) => order.get(a.product) - order.get(b.product) || a.order - b.order || a.slug.localeCompare(b.slug));
}

export function buildSearchIndex(documents, products) {
  // Explicit public projections: never serialize source records or whole product/document objects.
  return [
    ...products.map(product => ({ title: product.nameZh, product: product.nameZh, type: "product", url: `/products/${product.slug}/`, text: [product.nameZh, product.nameEn, product.shortPositioning, ...product.highlights, ...product.useCases].join(" ") })),
    ...documents.map(document => ({ title: document.title, product: products.find(p => p.slug === document.product)?.nameZh ?? "", type: "document", url: document.url, text: `${document.title} ${document.summary} ${document.text}` })),
  ];
}
