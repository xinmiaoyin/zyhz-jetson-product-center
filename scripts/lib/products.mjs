import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const text = z.string().trim().min(1);
const date = z.iso.date();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const seriesSlugs = ["thor", "agx-orin", "orin-nx", "orin-nano"];
const quickStartSources = { thor: "thor-guide", "agx-orin": "agx-guide", "orin-nano": "nano-guide" };
const officialUrl = z.url().refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && (url.hostname === "nvidia.com" || url.hostname.endsWith(".nvidia.com"));
}, "must be an HTTPS NVIDIA official URL");
const performanceMetricSchema = z.object({
  label: text, value: z.number().positive(), unit: text,
  precision: z.enum(["FP4", "FP8", "FP16", "INT8"]),
  sparsity: z.enum(["dense", "sparse"]), powerMode: text,
  sourceReference: text, verifiedAt: date,
});
const specRowSchema = z.object({ label: text, value: text, sourceReference: text, verifiedAt: date });

export const productSchema = z.object({
  slug, series: z.enum(seriesSlugs), nameZh: text, nameEn: text,
  productType: z.enum(["developer-kit", "production-module", "industrial-module"]),
  status: z.enum(["available", "new", "contact-sales"]),
  shortPositioning: z.string().min(12), heroImage: officialUrl,
  officialPartNumber: text.optional(),
  internalSku: text.refine(value => value.includes("示例"), "internalSku must visibly contain 示例").optional(),
  coreMetrics: z.array(z.object({ label: text, value: text, note: text.optional() })).length(4),
  highlights: z.array(z.string().min(8)).min(4).max(6),
  useCases: z.array(text).min(1),
  specGroups: z.array(z.object({ title: text, rows: z.array(specRowSchema).min(1) })).min(1),
  performanceMetrics: z.array(performanceMetricSchema).min(1),
  softwareSupport: z.array(text), documents: z.array(text), downloads: z.array(text),
  packageContents: z.array(text), optionalAccessories: z.array(text),
  relatedProducts: z.array(slug), sourceReferences: z.array(text).min(1),
  verifiedAt: date, imageAlt: text,
}).superRefine((product, ctx) => {
  const labels = new Set(product.specGroups.flatMap(group => group.rows.map(row => row.label)));
  const required = product.productType === "developer-kit" ? ["I/O", "快速开始"] : ["尺寸", "连接器", "功耗", "生命周期", "载板适配"];
  if (product.productType === "industrial-module") required.push("ECC", "工作温度", "可靠性", "工作寿命");
  for (const label of required) if (!labels.has(label)) ctx.addIssue({ code: "custom", path: ["specGroups"], message: `missing type-specific specification: ${label}` });
  if (product.productType === "developer-kit") {
    for (const field of ["packageContents", "documents"]) if (!product[field].length) ctx.addIssue({ code: "custom", path: [field], message: "developer kit requires nonempty content" });
    const guide = quickStartSources[product.series];
    if (!product.documents.includes(guide)) ctx.addIssue({ code: "custom", path: ["documents"], message: `developer kit requires its quick start document: ${guide}` });
    product.specGroups.forEach((group, i) => group.rows.forEach((row, j) => {
      if (row.label === "快速开始" && row.sourceReference !== guide) ctx.addIssue({ code: "custom", path: ["specGroups", i, "rows", j, "sourceReference"], message: `快速开始 sourceReference must be ${guide}` });
    }));
  }
  // Customer-facing performance is a formatted projection of verified metrics,
  // never an independent numeric claim in otherwise unvalidated free text.
  const displays = new Map(product.performanceMetrics.map(metric => [formatPerformance(metric), metric]));
  const fields = [{ value: product, path: [] }];
  while (fields.length) {
    const { value, path } = fields.pop();
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) fields.push({ value: child, path: [...path, Array.isArray(value) ? Number(key) : key] });
    } else if (typeof value === "string" && /(?<![a-z])(?:[KMGTPE]?FLOPS|[KMGTPE]?OPS)\b/i.test(value)) {
      if (path[0] === "performanceMetrics" && path[2] === "unit") continue;
      if (!displays.has(value)) ctx.addIssue({ code: "custom", path, message: "performance text must exactly match a complete validated performance metric" });
    }
  }
  const core = product.coreMetrics.findIndex(metric => metric.label === "AI 性能");
  if (core < 0 || !displays.has(product.coreMetrics[core].value)) ctx.addIssue({ code: "custom", path: ["coreMetrics", core < 0 ? 0 : core, "value"], message: "AI performance display must reference a validated performance metric" });
  product.specGroups.forEach((group, i) => group.rows.forEach((row, j) => {
    if (row.label !== "AI 性能" && !displays.has(row.value)) return;
    if (!displays.has(row.value)) ctx.addIssue({ code: "custom", path: ["specGroups", i, "rows", j, "value"], message: "performance display must match a validated performance metric" });
  }));
});

const seriesSchema = z.array(z.object({ slug: z.enum(seriesSlugs), name: text, order: z.number().int().positive() })).length(4);
const sourcesSchema = z.array(z.object({ id: text, title: text, url: officialUrl, publisher: z.literal("NVIDIA"), checkedAt: date })).min(1);

export async function loadCatalog(rootDir) {
  const raw = {};
  for (const name of ["products", "series", "sources"]) {
    try { raw[name] = JSON.parse(await readFile(join(rootDir, "data", `${name}.json`), "utf8")); }
    catch (error) { throw new Error(`catalog ${name}: ${error.message}`, { cause: error }); }
  }
  const errors = [];
  const seriesResult = seriesSchema.safeParse(raw.series);
  const sourcesResult = sourcesSchema.safeParse(raw.sources);
  for (const [name, result] of [["series", seriesResult], ["sources", sourcesResult]]) {
    if (!result.success) for (const issue of result.error.issues) errors.push(`${name}.${issue.path.join(".")}: ${issue.message}`);
  }
  if (!Array.isArray(raw.products) || raw.products.length !== 12) errors.push("catalog products: exactly twelve products required");
  const products = [];
  for (const [index, item] of (Array.isArray(raw.products) ? raw.products : []).entries()) {
    const result = productSchema.safeParse(item);
    if (result.success) products.push(result.data);
    else for (const issue of result.error.issues) errors.push(`${item?.slug ?? `products[${index}]`} ${issue.path.join(".")}: ${issue.message}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const series = seriesResult.data.sort((a, b) => a.order - b.order);
  const sources = sourcesResult.data;
  if (series.some((s, i) => s.slug !== seriesSlugs[i] || s.order !== i + 1)) errors.push("catalog series: expected four unique series in required order");
  const sourceById = new Map();
  for (const source of sources) {
    if (sourceById.has(source.id)) errors.push(`sources.${source.id}: duplicate id`);
    sourceById.set(source.id, source);
  }
  const slugs = new Set();
  for (const product of products) {
    if (slugs.has(product.slug)) errors.push(`${product.slug} slug: duplicate slug`);
    slugs.add(product.slug);
  }
  for (const product of products) {
    const prefix = product.slug;
    for (const [index, related] of product.relatedProducts.entries()) {
      if (!slugs.has(related)) errors.push(`${prefix} relatedProducts.${index}: unknown product ${related}`);
      if (related === prefix) errors.push(`${prefix} relatedProducts.${index}: self relationship forbidden`);
    }
    for (const [index, id] of product.sourceReferences.entries()) if (!sourceById.has(id)) errors.push(`${prefix} sourceReferences.${index}: unknown source ${id}`);
    if (!sources.some(source => source.url === product.heroImage && product.sourceReferences.includes(source.id))) errors.push(`${prefix} heroImage: image must have a registered source reference`);
    const evidence = product.performanceMetrics.map((metric, i) => [metric, `performanceMetrics.${i}`]);
    product.specGroups.forEach((group, i) => group.rows.forEach((row, j) => evidence.push([row, `specGroups.${i}.rows.${j}`])));
    for (const [row, path] of evidence) {
      const source = sourceById.get(row.sourceReference);
      if (!source) errors.push(`${prefix} ${path}.sourceReference: unknown source ${row.sourceReference}`);
      else {
        if (!product.sourceReferences.includes(source.id)) errors.push(`${prefix} ${path}.sourceReference: must be included in sourceReferences`);
        if (source.checkedAt !== row.verifiedAt) errors.push(`${prefix} ${path}.verifiedAt: must match source checkedAt`);
        if (product.verifiedAt < row.verifiedAt) errors.push(`${prefix} verifiedAt: predates individual evidence`);
      }
    }
    product.specGroups.forEach((group, i) => group.rows.forEach((row, j) => {
      const metric = product.performanceMetrics.find(item => formatPerformance(item) === row.value);
      if (metric && (metric.sourceReference !== row.sourceReference || metric.verifiedAt !== row.verifiedAt)) errors.push(`${prefix} specGroups.${i}.rows.${j}: performance evidence must match the validated performance metric`);
    }));
    for (const field of ["documents", "downloads"]) for (const [index, id] of product[field].entries()) {
      if (!sourceById.has(id) || !product.sourceReferences.includes(id)) errors.push(`${prefix} ${field}.${index}: unknown or undeclared source ${id}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return { products, series, sources };
}

export function getProduct(productSlug, catalog) {
  const product = catalog.products.find(item => item.slug === productSlug);
  if (!product) throw new Error(`Unknown product slug: ${productSlug}`);
  return product;
}

export function getRelatedProducts(product, catalog) {
  return product.relatedProducts.map(related => getProduct(related, catalog));
}

export function formatPerformance(metric) {
  const parsed = performanceMetricSchema.parse(metric);
  return `${parsed.value} ${parsed.unit} · ${parsed.precision} · ${parsed.sparsity === "sparse" ? "sparse（稀疏）" : "dense（稠密）"} · ${parsed.powerMode}`;
}
