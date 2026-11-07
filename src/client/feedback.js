import { sitePath } from "./site-path.js";

const mounted = new WeakSet();

export function mountFeedback(root) {
  if (mounted.has(root)) return;
  mounted.add(root);
  const view = root.ownerDocument.defaultView;
  const query = new URLSearchParams(view.location.search);
  const copyStatus = root.querySelector("[data-copy-status]");
  for (const button of root.querySelectorAll("[data-copy]")) {
    button.hidden = false;
    const label = button.textContent;
    let timer;
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      clearTimeout(timer);
      try {
        await view.navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = "已复制";
        copyStatus.textContent = "已复制模拟联系信息；仅供演示，请勿用于真实咨询。";
      } catch {
        button.textContent = "复制失败";
        copyStatus.textContent = "复制失败，请选中上方模拟电话或邮箱手动复制。";
      } finally {
        button.disabled = false;
        timer = setTimeout(() => { button.textContent = label; }, 2000);
      }
    });
  }

  if (root.hasAttribute("data-support-root")) {
    const product = root.querySelector('[name="product"]');
    const context = root.querySelector("[data-support-context]");
    const link = root.querySelector("[data-support-product-link]");
    const options = [...product.options];
    if (query.has("product")) product.value = options.some(option => option.value === query.get("product")) ? query.get("product") : "";
    const intent = query.get("intent") === "quote" ? "报价咨询" : "支持咨询";
    const update = () => {
      const selected = options.find(option => option.value && option.value === product.value);
      context.textContent = selected ? `当前产品：${selected.textContent} · ${intent}（示例）` : "通用支持咨询（示例）";
      link.hidden = !selected;
      if (selected) link.href = sitePath(`/products/${selected.value}/`, root.ownerDocument);
      else link.removeAttribute("href");
    };
    root.querySelector("[data-support-controls]").hidden = false;
    product.addEventListener("change", update);
    update();
  }

  if (root.hasAttribute("data-download-root")) {
    const product = root.querySelector('[name="product"]');
    const type = root.querySelector('[name="type"]');
    for (const select of [product, type]) {
      const value = query.get(select.name);
      select.value = [...select.options].some(option => option.value === value) ? value : "";
    }
    const records = [...root.querySelectorAll("[data-download-id]")];
    const update = () => {
      let count = 0;
      for (const record of records) {
        record.hidden = Boolean((product.value && record.dataset.product !== product.value) || (type.value && record.dataset.type !== type.value));
        if (!record.hidden) count++;
      }
      root.querySelector("[data-download-status]").textContent = count ? `显示 ${count} 条资料` : "没有匹配资料，请调整或清除筛选。";
    };
    root.querySelector("[data-download-controls]").hidden = false;
    product.addEventListener("change", update);
    type.addEventListener("change", update);
    root.querySelector("[data-download-reset]").addEventListener("click", () => { product.value = ""; type.value = ""; update(); });
    update();
  }
}

if (typeof document !== "undefined") for (const root of document.querySelectorAll("[data-feedback-root]")) mountFeedback(root);
