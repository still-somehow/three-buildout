/**
 * End-to-end check of the editor in headless Chromium (CPU WebGL).
 *   npm run test:editor
 * Works on a throwaway copy of the demo scene (scenes/_e2e.scene.json) and
 * writes screenshots to out/editor/. Exits 1 on the first failed check.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import * as THREE from "three";

const ROOT = resolve(import.meta.dirname, "..");
const SCENE = join(ROOT, "scenes", "_e2e.scene.json");
const OUT = join(ROOT, "out", "editor");
const PORT = 5174;
const URL_ = `http://localhost:${PORT}/?scene=_e2e`;

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failures++;
};
const readScene = () => JSON.parse(readFileSync(SCENE, "utf8"));
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/scenes`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("vite did not start");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(join(ROOT, "scenes", "demo.scene.json"), SCENE);
  const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    await waitForServer();
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    console.log("load");
    await page.goto(URL_);
    await page.waitForSelector("canvas");
    await page.waitForTimeout(1500);
    ok((await page.locator(".tree-label", { hasText: "counter" }).count()) > 0, "outliner lists scene objects");
    await shot(page, "01-loaded");

    console.log("select + edit via inspector");
    await page.locator(".tree-row", { hasText: "counter" }).first().click();
    ok(await page.locator(".section-title", { hasText: "Group · counter" }).isVisible(), "inspector shows the selected group");
    const posX = page.locator(".row", { hasText: "position" }).first().locator("input.num").first();
    await posX.fill("1.5");
    await posX.press("Enter");
    ok(await page.locator("button", { hasText: "● Save" }).isVisible(), "edit marks the scene dirty");
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(400);
    const counter = readScene().objects.find((o: { id: string }) => o.id === "counter");
    ok(JSON.stringify(counter.transform.position) === "[1.5,0,-0.5]", `save writes the edit to disk (${JSON.stringify(counter.transform.position)})`);
    ok(readFileSync(SCENE, "utf8").includes('"position": [1.5, 0, -0.5]'), "saved file uses the compact format");

    console.log("auto-key on animated object");
    await page.locator(".tree-row", { hasText: "actor-a" }).first().click();
    await page.locator("input.scrubber").fill("24");
    const aPosX = page.locator(".row", { hasText: "position" }).first().locator("input.num").first();
    await aPosX.fill("1.0");
    await aPosX.press("Enter");
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(400);
    const track = readScene().tracks.find((t: { target: string; property: string }) => t.target === "actor-a" && t.property === "position");
    ok(track.keys.some((k: { frame: number; value: number[] }) => k.frame === 24 && k.value[0] === 1), "editing an animated property adds a key at the current frame");
    await shot(page, "02-rig-selected");

    console.log("add + undo/redo");
    const before = await page.locator(".tree .tree-row").count();
    await page.locator(".add-grid button", { hasText: "Box" }).click();
    ok((await page.locator(".tree .tree-row").count()) === before + 1, "Add Box creates an object");
    ok(await page.locator(".section-title", { hasText: "Primitive · box" }).isVisible(), "new object is selected");
    await page.locator("body").click({ position: { x: 5, y: 5 } }); // leave inputs
    await page.keyboard.press("Control+z");
    ok((await page.locator(".tree .tree-row").count()) === before, "undo removes it");
    await page.keyboard.press("Control+Shift+z");
    ok((await page.locator(".tree .tree-row").count()) === before + 1, "redo restores it");
    await page.keyboard.press("Delete");
    ok((await page.locator(".tree .tree-row").count()) === before, "Delete key removes the selection");

    console.log("click-select in the viewport");
    await page.keyboard.press("Escape");
    await page.locator("input.scrubber").fill("0");
    const canvas = page.locator(".viewport canvas");
    const box = (await canvas.boundingBox())!;
    // Project the pillar's middle through the editor's live orbit camera.
    const view = await page.evaluate(() => {
      const v = (globalThis as unknown as { __orbitView: { position: { toArray(): number[] }; target: { toArray(): number[] }; fov: number } }).__orbitView;
      return { position: v.position.toArray(), target: v.target.toArray(), fov: v.fov };
    });
    const cam = new THREE.PerspectiveCamera(view.fov, box.width / box.height, 0.05, 500);
    cam.position.set(view.position[0], view.position[1], view.position[2]);
    cam.lookAt(view.target[0], view.target[1], view.target[2]);
    cam.updateMatrixWorld();
    const p = new THREE.Vector3(2.6, 1.4, -2.4).project(cam);
    await page.mouse.click(box.x + ((p.x + 1) / 2) * box.width, box.y + ((1 - p.y) / 2) * box.height);
    await page.waitForTimeout(300);
    ok(await page.locator(".section-title", { hasText: "Primitive · pillar" }).isVisible(), "clicking an object in the viewport selects it");
    await shot(page, "03-viewport-select");

    console.log("gizmo drag");
    const toScreen = (v: THREE.Vector3) => {
      const q = v.clone().project(cam);
      return { x: box.x + ((q.x + 1) / 2) * box.width, y: box.y + ((1 - q.y) / 2) * box.height };
    };
    // The X arrow starts at the pillar's origin (its base); grab it a little way along +X.
    const grab = toScreen(new THREE.Vector3(2.6 + 0.35, 0, -2.4));
    const drop = toScreen(new THREE.Vector3(2.6 + 1.35, 0, -2.4));
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(grab.x + ((drop.x - grab.x) * i) / 10, grab.y + ((drop.y - grab.y) * i) / 10);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(400);
    const pillar = readScene().objects.find((o: { id: string }) => o.id === "pillar");
    const px = pillar.transform.position[0];
    ok(px > 3.1 && Math.abs(pillar.transform.position[1]) < 1e-6 && pillar.transform.position[2] === -2.4, `dragging the X arrow moves the object along X only (x ${2.6} → ${px})`);
    ok(await page.locator(".section-title", { hasText: "Primitive · pillar" }).isVisible(), "selection survives the drag");
    await shot(page, "03b-gizmo-drag");

    console.log("joint posing");
    await page.locator(".tree-row", { hasText: "actor-b" }).first().click();
    await page.locator(".section", { hasText: "Rig · humanoid" }).locator("select").nth(2).selectOption("shoulderR");
    ok(await page.locator(".section-title", { hasText: "Joint · actor-b / shoulderR" }).isVisible(), "joint picker selects a joint");
    const jz = page.locator(".row", { hasText: "rotation" }).first().locator("input.num").nth(2);
    await jz.fill("-80");
    await jz.press("Enter");
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(400);
    const b = readScene().objects.find((o: { id: string }) => o.id === "actor-b");
    ok(b.joints?.shoulderR?.[2] === -80, "joint rotation saved as an override");
    await shot(page, "04-joint");

    console.log("camera view + preview");
    await page.locator(".toolbar select").nth(1).selectOption("close");
    await page.locator("input.scrubber").fill("70");
    await page.waitForTimeout(600);
    ok(await page.locator(".viewport-badge").isVisible(), "look-through-camera mode shows its badge");
    await shot(page, "05-camera-view");
    await page.keyboard.press("Escape");
    await page.locator("button", { hasText: "Preview" }).click();
    await page.waitForTimeout(1500);
    ok((await page.locator(".preview canvas").count()) > 0, "Remotion preview renders a canvas");
    await shot(page, "06-preview");

    console.log("external edit reloads");
    const doc = readScene();
    doc.name = "Edited outside the editor";
    writeFileSync(SCENE, JSON.stringify(doc, null, 2));
    await page.waitForTimeout(1500);
    ok(await page.locator(".scene-row", { hasText: "Edited outside the editor" }).isVisible(), "editor reloads when the file changes on disk");

    console.log("validation guard");
    await page.locator(".scene-row").click();
    const frames = page.locator(".row", { hasText: "frames" }).locator("input.num");
    await frames.fill("10");
    await frames.press("Enter");
    ok(await page.locator(".banner.error").isVisible(), "invalid edit (shots beyond duration) shows errors");
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(300);
    ok(readScene().durationInFrames !== 10, "invalid scene is not saved");

    ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  } finally {
    await browser.close();
    vite.kill();
    if (existsSync(SCENE)) rmSync(SCENE);
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall editor checks passed");
  console.log(`screenshots → out/editor/`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  if (existsSync(SCENE)) rmSync(SCENE);
  process.exit(1);
});
