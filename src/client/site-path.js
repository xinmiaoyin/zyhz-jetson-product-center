export function sitePath(path, doc = globalThis.document) {
  const basePath = doc?.documentElement?.dataset?.basePath ?? "";
  if (!basePath || typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return path;
  return `${basePath}${path}`;
}
