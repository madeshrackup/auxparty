/** Vercel compiles files outside client/ as CJS, so named ESM imports from shared/ fail. */
export function sharedModule<T extends object>(mod: T): T {
  const rec = mod as T & { default?: T };
  const keys = Object.keys(rec).filter((key) => key !== "default" && key !== "__esModule");
  if (keys.length > 0) return rec;
  if (rec.default && typeof rec.default === "object") return rec.default;
  return rec;
}
