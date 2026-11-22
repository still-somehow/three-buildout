/**
 * npm run qa -- <scene> [objectId] [--frame N] [--ref path/to/image] [--full] [--turntable]
 *
 * Prints stats + issues, writes out/qa/<name>.stats.json, and renders the
 * contact sheet to out/qa/<name>.png (and a turntable MP4 with --turntable).
 * Exits 1 if any error-level issue is found.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { resolveScene } from "../src/scene/animation";
import { parseScene } from "../src/scene/schema";
import { isolateSubtree } from "../src/qa/isolate";
import { computeStats } from "../src/qa/stats";
import { compId } from "../src/scene/loadScenes";

const ROOT = resolve(import.meta.dirname, "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frame: { type: "string", default: "0" },
    ref: { type: "string" },
    full: { type: "boolean", default: false },
    turntable: { type: "boolean", default: false },
  },
});

const [slug, objectId] = positionals;
if (!slug) {
  console.error("usage: npm run qa -- <scene> [objectId] [--frame N] [--ref image] [--full] [--turntable]");
  process.exit(2);
}
const sceneFile = join(ROOT, "scenes", `${slug}.scene.json`);
if (!existsSync(sceneFile)) {
  console.error(`No scene file ${relative(ROOT, sceneFile)}`);
  process.exit(2);
}

const frame = Number(values.frame);
const scene = parseScene(JSON.parse(readFileSync(sceneFile, "utf8")), relative(ROOT, sceneFile));
let target = resolveScene(scene, frame);
if (objectId) target = isolateSubtree(target, objectId);
const stats = computeStats(target);

const name = objectId ? `${slug}-${objectId}` : slug;
const outDir = join(ROOT, "out", "qa");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.stats.json`), JSON.stringify({ scene: slug, objectId, frame, ...stats }, null, 2));

// ---- terminal summary
const b = stats.bounds;
console.log(`\nQA ${name} @ frame ${frame}`);
console.log(`  ${stats.primitives} primitives, ${stats.triangles} tris, ${stats.vertices} verts`);
if (b) console.log(`  size W ${b.size[0]} × H ${b.size[1]} × D ${b.size[2]} m   min ${b.min.join(", ")}   max ${b.max.join(", ")}`);
const icon = { error: "✗", warning: "!", info: "i" } as const;
if (stats.issues.length === 0) console.log("  ✓ no issues");
for (const i of stats.issues) console.log(`  ${icon[i.severity]} ${i.severity}${i.objectId ? ` [${i.objectId}]` : ""}: ${i.message}`);

// ---- reference image must live under public/ for Remotion to serve it
let reference: string | undefined;
if (values.ref) {
  const src = resolve(values.ref);
  const pub = join(ROOT, "public");
  if (!existsSync(src)) {
    console.error(`Reference image not found: ${values.ref}`);
    process.exit(2);
  }
  if (src.startsWith(pub + "/")) reference = relative(pub, src);
  else {
    mkdirSync(join(pub, "refs"), { recursive: true });
    copyFileSync(src, join(pub, "refs", basename(src)));
    reference = `refs/${basename(src)}`;
  }
}

// ---- renders
const props = JSON.stringify({ objectId, frame, reference });
const remotion = (args: string[]) => {
  const r = spawnSync("npx", ["remotion", ...args, `--props=${props}`, "--log=error"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const scale = values.full ? [] : ["--scale=0.75"];
const png = join(outDir, `${name}.png`);
remotion(["still", "src/remotion/index.ts", compId("QA", slug), png, ...scale]);
console.log(`\n  contact sheet → ${relative(ROOT, png)}`);

// Back faces render pure magenta. A handful of pixels is antialiasing noise at
// silhouettes; more than that means flipped normals or holes.
const magenta = countMagenta(png);
const MAGENTA_LIMIT = 60;
if (magenta > MAGENTA_LIMIT) {
  const msg = `${magenta} magenta pixels in the contact sheet: back faces visible (flipped normals or holes)`;
  stats.issues.push({ severity: "warning", message: msg });
  console.log(`  ! warning: ${msg}`);
} else {
  console.log(`  ✓ back-face check: ${magenta} magenta px (≤ ${MAGENTA_LIMIT} is noise)`);
}
writeFileSync(join(outDir, `${name}.stats.json`), JSON.stringify({ scene: slug, objectId, frame, ...stats, magentaPixels: magenta }, null, 2));
if (values.turntable) {
  const mp4 = join(outDir, `${name}-turntable.mp4`);
  remotion(["render", "src/remotion/index.ts", compId("Turntable", slug), mp4]);
  console.log(`  turntable     → ${relative(ROOT, mp4)}`);
}
console.log(`  stats         → ${relative(ROOT, join(outDir, `${name}.stats.json`))}\n`);

if (stats.issues.some((i) => i.severity === "error")) process.exit(1);

function countMagenta(file: string): number {
  const { data, width, height } = PNG.sync.read(readFileSync(file));
  let n = 0;
  for (let i = 0; i < width * height * 4; i += 4) {
    if (data[i] > 200 && data[i + 1] < 80 && data[i + 2] > 200) n++;
  }
  return n;
}
