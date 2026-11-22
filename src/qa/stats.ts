/**
 * Geometry stats and sanity checks. Pure three.js — runs in Node (CLI) and the
 * browser (burned into contact sheets).
 */
import * as THREE from "three";
import { buildObject3D } from "../scene/build";
import type { Scene, Vec3 } from "../scene/schema";

export type Bounds = { min: Vec3; max: Vec3; size: Vec3; center: Vec3 };

export type Issue = {
  severity: "error" | "warning" | "info";
  objectId?: string;
  message: string;
};

export type ObjectStats = { id: string; triangles: number; vertices: number; bounds: Bounds };

export type SceneStats = {
  objects: number;
  primitives: number;
  triangles: number;
  vertices: number;
  /** Bounds of everything except ground planes (planes would swamp the size). */
  bounds: Bounds | null;
  perObject: ObjectStats[];
  issues: Issue[];
};

/** Per-primitive triangle budget for greybox. */
export const TRIANGLE_BUDGET = 2000;
const EPS = 0.02; // metres

const round = (n: number) => Math.round(n * 1000) / 1000;
const v3 = (v: THREE.Vector3): Vec3 => [round(v.x), round(v.y), round(v.z)];

export function toBounds(box: THREE.Box3): Bounds {
  return {
    min: v3(box.min),
    max: v3(box.max),
    size: v3(box.getSize(new THREE.Vector3())),
    center: v3(box.getCenter(new THREE.Vector3())),
  };
}

function triCount(g: THREE.BufferGeometry) {
  return Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
}

/**
 * Overlap depth of mesh `a` into mesh `b`, measured in b's local frame: a's
 * local box corners are carried into b's space and boxed. 0 = separate.
 */
function localOverlap(a: THREE.Mesh, b: THREE.Mesh): number {
  a.geometry.computeBoundingBox();
  b.geometry.computeBoundingBox();
  const ab = a.geometry.boundingBox!;
  const toB = new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(a.matrixWorld);
  const boxInB = new THREE.Box3();
  for (const x of [ab.min.x, ab.max.x])
    for (const y of [ab.min.y, ab.max.y])
      for (const z of [ab.min.z, ab.max.z]) boxInB.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(toB));
  const inter = boxInB.intersect(b.geometry.boundingBox!.clone());
  if (inter.isEmpty()) return 0;
  // Express the depth in metres (b's local axes may be scaled).
  const scale = new THREE.Vector3().setFromMatrixScale(b.matrixWorld);
  const d = inter.getSize(new THREE.Vector3()).multiply(scale);
  return Math.min(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z));
}

export function computeStats(scene: Pick<Scene, "objects">): SceneStats {
  const built = buildObject3D(scene);
  const issues: Issue[] = [];
  const perObject: ObjectStats[] = [];
  const boxes = new Map<string, THREE.Box3>();
  const overall = new THREE.Box3();
  const byId = new Map(scene.objects.map((o) => [o.id, o]));

  const rootOf = (id: string) => {
    let o = byId.get(id)!;
    while (o.parent) o = byId.get(o.parent)!;
    return o.id;
  };
  const isPlane = (id: string) => {
    const o = byId.get(id);
    return o?.type === "primitive" && o.shape.kind === "plane";
  };
  const isVisible = (id: string) => {
    for (let o = byId.get(id); o; o = o.parent ? byId.get(o.parent) : undefined) if (!o.visible) return false;
    return true;
  };

  let triangles = 0;
  let vertices = 0;
  for (const [id, mesh] of built.meshes) {
    const t = triCount(mesh.geometry);
    const v = mesh.geometry.attributes.position.count;
    const box = new THREE.Box3().setFromObject(mesh, true);
    triangles += t;
    vertices += v;
    perObject.push({ id, triangles: t, vertices: v, bounds: toBounds(box) });
    if (!isVisible(id)) continue;
    boxes.set(id, box);
    if (!isPlane(id)) overall.union(box);
    if (t > TRIANGLE_BUDGET)
      issues.push({ severity: "warning", objectId: id, message: `${t} triangles (budget ${TRIANGLE_BUDGET})` });
  }

  for (const o of scene.objects) {
    if (o.transform.scale.some((s) => Math.abs(s) < 1e-6))
      issues.push({ severity: "error", objectId: o.id, message: "zero scale on an axis" });
    else if (o.transform.scale.some((s) => s < 0))
      issues.push({ severity: "warning", objectId: o.id, message: "negative scale (mirrored; normals flip)" });
  }

  const ids = [...boxes.keys()].filter((id) => !isPlane(id));
  const xzOverlap = (a: THREE.Box3, b: THREE.Box3) =>
    a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;

  // Ground checks run per top-level object (a hat on a head is fine).
  const rootBoxes = new Map<string, THREE.Box3>();
  for (const id of ids) {
    const r = rootOf(id);
    rootBoxes.set(r, (rootBoxes.get(r) ?? new THREE.Box3()).union(boxes.get(id)!));
  }
  for (const [id, box] of rootBoxes) {
    if (box.min.y < -EPS)
      issues.push({ severity: "warning", objectId: id, message: `extends ${round(-box.min.y)} m below the floor` });
    if (box.min.y > EPS) {
      // Supported if another object's top is at our bottom, under our footprint.
      const supported = ids.some((other) => {
        const ob = boxes.get(other)!;
        return rootOf(other) !== id && xzOverlap(box, ob) && ob.max.y >= box.min.y - EPS && ob.min.y < box.min.y;
      });
      if (!supported)
        issues.push({ severity: "warning", objectId: id, message: `floating ${round(box.min.y)} m above the floor` });
    }
  }

  // Possible interpenetration between separate top-level objects. Each pair of
  // parts is tested in both parts' own (rotated) frames and the smaller overlap
  // kept, which is much tighter than world-aligned boxes. Reported once per
  // pair of top-level objects.
  const pairs = new Map<string, { a: string; b: string; depth: number; parts: number }>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      const [ra, rb] = [rootOf(a), rootOf(b)];
      if (ra === rb) continue;
      if (boxes.get(a)!.clone().intersect(boxes.get(b)!).isEmpty()) continue; // cheap reject
      const depth = Math.min(localOverlap(built.meshes.get(a)!, built.meshes.get(b)!), localOverlap(built.meshes.get(b)!, built.meshes.get(a)!));
      if (depth <= EPS) continue;
      const key = ra < rb ? `${ra}|${rb}` : `${rb}|${ra}`;
      const p = pairs.get(key) ?? { a: ra < rb ? ra : rb, b: ra < rb ? rb : ra, depth: 0, parts: 0 };
      p.depth = Math.max(p.depth, depth);
      p.parts++;
      pairs.set(key, p);
    }
  }
  for (const p of pairs.values())
    issues.push({
      severity: "info",
      objectId: p.a,
      message: `may interpenetrate "${p.b}" by up to ${round(p.depth)} m (${p.parts} part pair${p.parts > 1 ? "s" : ""})`,
    });

  built.dispose();
  return {
    objects: scene.objects.length,
    primitives: built.meshes.size,
    triangles,
    vertices,
    bounds: overall.isEmpty() ? null : toBounds(overall),
    perObject,
    issues,
  };
}
