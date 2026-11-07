import { sitePath } from "./site-path.js";

const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();

export function searchIndex(records, query) {
  const needle = normalize(query);
  if (!needle) return [];
  return records.map((record, index) => {
    const title = normalize(record.title);
    const score = title === needle ? 3 : title.includes(needle) ? 2 : normalize(`${record.product ?? ""} ${record.text}`).includes(needle) ? 1 : 0;
    return { record, score, index };
  }).filter(item => item.score).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.record);
}

const mounted = new WeakSet();
export function mountSearch(root, fetcher = globalThis.fetch.bind(globalThis)) {
  if (mounted.has(root)) return;
  mounted.add(root);
  const doc = root.ownerDocument;
  const input = root.querySelector("input");
  const results = root.querySelector("[data-search-results]");
  const status = root.querySelector('[role="status"]');
  const guidance = root.querySelector("[data-search-guidance]");
  let pending;
  let revision = 0;
  const update = async () => {
    const current = ++revision;
    const query = normalize(input.value);
    results.replaceChildren();
    guidance.hidden = false;
    if (!query) { status.textContent = "输入产品名称或技术关键词，也可按下方目录浏览。"; return; }
    status.textContent = "正在搜索…";
    try {
      pending ??= fetcher(sitePath("/assets/search-index.json", doc)).then(response => {
        if (!response.ok) throw new Error("search index unavailable");
        return response.json();
      });
      const records = await pending;
      if (current !== revision) return;
      const matches = searchIndex(records, query);
      status.textContent = matches.length ? `找到 ${matches.length} 条结果` : "没有找到匹配结果，请调整关键词或清除搜索，按系列浏览产品。";
      guidance.hidden = matches.length > 0;
      for (const record of matches) {
        if (typeof record.url !== "string" || !/^\/(?:docs|products)\/[a-z0-9/-]*$/.test(record.url)) continue;
        const item = doc.createElement("li");
        const link = doc.createElement("a");
        link.href = sitePath(record.url, doc);
        link.textContent = record.title;
        const meta = doc.createElement("p");
        meta.className = "muted";
        meta.textContent = `${record.type === "product" ? "产品" : "技术文档"} · ${record.product}`;
        item.append(link, meta);
        results.append(item);
      }
    } catch {
      if (current === revision) status.textContent = "搜索暂时无法加载，请使用文档目录或产品系列入口。";
    }
  };
  root.querySelector("form").addEventListener("submit", event => { event.preventDefault(); update(); });
  input.addEventListener("input", update);
  root.querySelector("[data-search-clear]").addEventListener("click", () => { input.value = ""; update(); input.focus(); });
  update();
}

if (typeof document !== "undefined") for (const root of document.querySelectorAll("[data-doc-search]")) mountSearch(root);
