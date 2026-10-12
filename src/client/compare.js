const fields = [["series", "series"], ["type", "types"], ["memory", "memory"], ["power", "power"], ["industrial", "industrial"], ["useCase", "useCases"], ["status", "status"], ["compare", "compare"]];
const limitMessage = "最多比较 4 款产品，请先移除一款再添加。";
const unique = values => [...new Set(values)];
const metric = (product, label) => product.coreMetrics.find(item => item.label === label)?.value ?? "";
const mountedRoots = new WeakSet();

// Known enum values are schema vocabulary; all configuration values come from the catalog.
export function filterOptions(products = []) {
  return {
    series: ["thor", "agx-orin", "orin-nx", "orin-nano"],
    type: ["developer-kit", "production-module", "industrial-module"],
    memory: unique(products.map(product => metric(product, "内存"))),
    power: unique(products.map(product => metric(product, "功耗"))),
    useCase: unique(products.flatMap(product => product.useCases)),
    status: ["available", "new", "contact-sales"],
  };
}

export function parseCompareState(search, validProducts) {
  const products = Array.isArray(validProducts) ? validProducts : [];
  const options = filterOptions(products);
  const validSlugs = validProducts instanceof Set ? validProducts : new Set(products.map(product => product.slug));
  const query = new URLSearchParams(search);
  const state = {};
  for (const [key, field] of fields) {
    if (key === "industrial") {
      state[field] = query.getAll(key).includes("1");
      continue;
    }
    const allowed = key === "compare" ? validSlugs : new Set(options[key]);
    state[field] = unique(query.getAll(key).flatMap(value => value.split(","))).filter(value => allowed.has(value));
  }
  if (state.compare.length > 4) {
    state.compare = state.compare.slice(0, 4);
    state.message = `${limitMessage} 已恢复链接中的前 4 款。`;
  }
  return state;
}

export function serializeCompareState(state) {
  const query = new URLSearchParams();
  for (const [key, field] of fields) {
    if (key === "industrial") {
      if (state[field]) query.set(key, "1");
    } else if (state[field]?.length) query.set(key, unique(state[field]).join(","));
  }
  return query.size ? `?${query}` : "";
}

export function applyFilters(products, state) {
  const matches = (values, value) => !values.length || values.includes(value);
  return products.filter(product => matches(state.series, product.series)
    && matches(state.types, product.productType)
    && matches(state.memory, metric(product, "内存"))
    && matches(state.power, metric(product, "功耗"))
    && (!state.industrial || product.productType === "industrial-module")
    && (!state.useCases.length || product.useCases.some(value => state.useCases.includes(value)))
    && matches(state.status, product.status));
}

export function toggleComparedProduct(state, slug) {
  if (state.compare.includes(slug)) return { state: { ...state, compare: state.compare.filter(value => value !== slug) }, message: "已移除产品。" };
  if (state.compare.length >= 4) return { state, message: limitMessage };
  return { state: { ...state, compare: [...state.compare, slug] }, message: "已加入对比。" };
}

export function mountCompare(root, products) {
  // Keep one state closure and one set of listeners for each page root.
  if (mountedRoots.has(root)) return;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const form = root.querySelector("[data-filter-form]");
  const drawer = root.querySelector("[data-filter-drawer]");
  const trigger = root.querySelector("[data-filter-trigger]");
  const live = root.querySelector('[role="status"]');
  const tray = root.querySelector("[data-compare-tray]");
  const panel = root.querySelector("[data-comparison-panel]");
  let state = parseCompareState(win.location.search, products);
  const make = (tag, text, className) => {
    const el = doc.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };

  function renderPanel(selected) {
    panel.replaceChildren();
    panel.hidden = !selected.length;
    if (!selected.length) return;
    const heading = make("h2", "规格分组对比");
    heading.id = "comparison-title";
    panel.append(heading, make("p", "性能保留精度、稀疏性与功耗口径；不同计算口径不可直接按数值比较。", "metric-notice"));
    // Product order and each product's specification order follow the verified catalog.
    const groups = unique(selected.flatMap(product => product.specGroups.map(group => group.title)));
    for (const title of groups) {
      const section = make("section", "", "comparison-group");
      section.dataset.specGroup = title;
      section.append(make("h3", title));
      const grid = make("div", "", "comparison-columns");
      for (const product of selected) {
        const column = make("article", "", "comparison-column");
        column.dataset.specProduct = product.slug;
        column.append(make("h4", product.nameZh));
        const group = product.specGroups.find(item => item.title === title);
        const specs = make("dl");
        for (const row of group?.rows ?? []) {
          const item = make("div");
          item.append(make("dt", row.label), make("dd", row.value));
          specs.append(item);
        }
        column.append(group ? specs : make("p", "该产品未列出此组规格。"));
        grid.append(column);
      }
      section.append(grid);
      panel.append(section);
    }
  }

  function update(message = "") {
    const visible = new Set(applyFilters(products, state).map(product => product.slug));
    for (const el of root.querySelectorAll("[data-product]")) el.hidden = !visible.has(el.dataset.product);
    for (const [key, field] of fields) for (const input of form.querySelectorAll(`input[name="${key}"]`)) input.checked = key === "industrial" ? state.industrial : state[field].includes(input.value);
    root.querySelector("[data-result-count]").textContent = String(visible.size);
    root.querySelector("[data-selected-count]").textContent = String(state.compare.length);
    root.querySelector("[data-empty-results]").hidden = visible.size !== 0;
    for (const action of root.querySelectorAll("[data-toggle-compare]")) {
      const selected = state.compare.includes(action.dataset.toggleCompare);
      action.setAttribute("aria-pressed", String(selected));
      const name = products.find(product => product.slug === action.dataset.toggleCompare).nameZh;
      action.textContent = selected ? "移除对比" : "加入对比";
      action.setAttribute("aria-label", `${action.textContent}：${name}`);
    }
    const selected = products.filter(product => state.compare.includes(product.slug));
    tray.replaceChildren();
    for (const product of selected) {
      const item = make("li");
      const remove = make("button", `移除 ${product.nameZh}`);
      remove.type = "button";
      remove.dataset.removeCompare = product.slug;
      item.append(remove);
      tray.append(item);
    }
    renderPanel(selected);
    const url = `${win.location.pathname}${serializeCompareState(state)}${win.location.hash}`;
    win.history.replaceState(null, "", url);
    live.textContent = message || `找到 ${visible.size} 款产品，已选 ${state.compare.length} 款。`;
  }

  function setDrawer(open, returnFocus = false) {
    drawer.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) drawer.querySelector("button, input").focus();
    else if (returnFocus) trigger.focus();
  }
  trigger.hidden = false;
  root.querySelector("[data-filter-close]").hidden = false;
  setDrawer(false);
  trigger.addEventListener("click", () => setDrawer(drawer.hidden, !drawer.hidden));
  root.querySelector("[data-filter-close]").addEventListener("click", () => setDrawer(false, true));
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !drawer.hidden) {
      event.preventDefault();
      setDrawer(false, true);
    }
  });
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("change", () => {
    const query = new URLSearchParams(new win.FormData(form));
    query.set("compare", state.compare.join(","));
    state = parseCompareState(query, products);
    update();
  });
  form.addEventListener("reset", event => {
    event.preventDefault();
    state = parseCompareState("", products);
    update("已重置筛选与对比选择。");
  });
  root.addEventListener("click", event => {
    const action = event.target.closest("[data-toggle-compare], [data-remove-compare]");
    if (!action || !root.contains(action)) return;
    event.preventDefault();
    const slug = action.dataset.toggleCompare ?? action.dataset.removeCompare;
    if (!products.some(product => product.slug === slug)) return;
    const result = toggleComparedProduct(state, slug);
    // A rejected fifth choice changes only the live announcement, never URL or state.
    if (result.state === state) { live.textContent = result.message; return; }
    state = result.state;
    const wasRemoval = action.hasAttribute("data-remove-compare");
    update(result.message);
    if (wasRemoval) (tray.querySelector("button") ?? trigger).focus();
  });
  win.addEventListener("popstate", () => {
    state = parseCompareState(win.location.search, products);
    update(state.message);
  });
  update(state.message);
  mountedRoots.add(root);
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-compare-root]");
  if (root) mountCompare(root, JSON.parse(root.querySelector("#catalog-data").textContent));
}
