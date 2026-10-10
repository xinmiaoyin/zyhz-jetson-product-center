import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { escapeHtml as e } from "./html.mjs";

export async function copyAssets({ rootDir, outDir, products }) {
  const assetDir = join(outDir, "assets");
  await mkdir(assetDir, { recursive: true });
  await cp(join(rootDir, "assets"), assetDir, { recursive: true });
  await cp(join(rootDir, "src/styles"), join(assetDir, "styles"), { recursive: true });
  await cp(join(rootDir, "src/client"), join(assetDir, "client"), { recursive: true }).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  const fallbackDir = join(assetDir, "product-fallbacks");
  await mkdir(fallbackDir, { recursive: true });
  for (const product of products) {
    const name = e(product.nameZh);
    await writeFile(join(fallbackDir, `${product.slug}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-labelledby="title description"><title id="title">${name}</title><desc id="description">中性产品图片占位；不代表实物外观。</desc><rect width="640" height="400" fill="#f3f7f5"/><rect x="240" y="92" width="160" height="112" rx="8" fill="none" stroke="#a2b5ae" stroke-width="2"/><path d="M264 176l32-32 24 24 32-40 24 48" fill="none" stroke="#a2b5ae" stroke-width="2"/><text x="320" y="264" text-anchor="middle" fill="#172321" font-family="Arial, Microsoft YaHei, sans-serif" font-size="20">${name}</text><text x="320" y="300" text-anchor="middle" fill="#53635f" font-family="Arial, Microsoft YaHei, sans-serif" font-size="16">产品图片暂不可用</text></svg>\n`, "utf8");
  }
}
