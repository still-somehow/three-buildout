/**
 * Readable, diff-friendly JSON for scene files: number arrays stay on one line,
 * short objects stay on one line, everything else is indented.
 */
const LINE = 100;

export function formatSceneJson(value: unknown): string {
  return fmt(value, 0) + "\n";
}

const isNumArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "number");

function fmt(v: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  const one = inline(v);
  if (v === null || typeof v !== "object" || isNumArray(v)) return one;
  const hasBigChild = Object.values(v as object).some(
    (x) => x !== null && typeof x === "object" && !isNumArray(x) && JSON.stringify(x).length > 40,
  );
  if (one.length + pad.length <= LINE && !hasBigChild) return one;
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[\n${v.map((x) => `${pad}  ${fmt(x, depth + 1)}`).join(",\n")}\n${pad}]`;
  }
  const entries = Object.entries(v as object).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${fmt(x, depth + 1)}`).join(",\n")}\n${pad}}`;
}

/** One-line JSON with a space after commas and colons (never touches string contents). */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v !== null && typeof v === "object")
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
      .join(", ")}}`;
  return JSON.stringify(v) ?? "null";
}
