/**
 * Pure edit operations on a scene document (the raw JSON as written in
 * scenes/*.scene.json, defaults omitted). Every function returns a new doc;
 * the editor's undo history is just a list of docs.
 */
import type { SceneInput, Vec3 } from "../../src/scene/schema";

export type SceneDoc = SceneInput;
export type DocObject = NonNullable<SceneDoc["objects"]>[number];
export type DocCamera = SceneDoc["cameras"][number];
type DocTrack = NonNullable<SceneDoc["tracks"]>[number];
type DocKey = DocTrack["keys"][number];
export type TransformProp = "position" | "rotation" | "scale";

const clone = <T>(v: T): T => structuredClone(v);
const round = (n: number) => Math.round(n * 1e4) / 1e4 + 0;
export const roundVec = (v: readonly number[]): Vec3 => [round(v[0]), round(v[1]), round(v[2])];

const DEFAULT_TRANSFORM: Record<TransformProp, Vec3> = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

export const objects = (doc: SceneDoc) => doc.objects ?? [];
export const getObject = (doc: SceneDoc, id: string) => objects(doc).find((o) => o.id === id);
export const getCamera = (doc: SceneDoc, id: string) => doc.cameras.find((c) => c.id === id);

export function baseTransform(o: DocObject, prop: TransformProp): Vec3 {
  return (o.transform?.[prop] as Vec3 | undefined) ?? DEFAULT_TRANSFORM[prop];
}

export function findTrack(doc: SceneDoc, target: string, property: string): DocTrack | undefined {
  return (doc.tracks ?? []).find((t) => t.target === target && t.property === property);
}

/** Inserts or replaces the key at `frame`, creating the track if needed. */
export function upsertKey(doc: SceneDoc, target: string, property: string, frame: number, value: number | Vec3): SceneDoc {
  const d = clone(doc);
  d.tracks ??= [];
  let track = d.tracks.find((t) => t.target === target && t.property === property);
  if (!track) {
    track = { target, property, keys: [] };
    d.tracks.push(track);
  }
  const v = typeof value === "number" ? round(value) : roundVec(value);
  const existing = track.keys.find((k) => k.frame === frame);
  if (existing) existing.value = v;
  else {
    track.keys.push({ frame, value: v } as DocKey);
    track.keys.sort((a, b) => a.frame - b.frame);
  }
  return d;
}

/** Removes every key at `frame` for `target` (transform/joint tracks and rig pose keys). */
export function deleteKeysAt(doc: SceneDoc, target: string, frame: number): SceneDoc {
  const d = clone(doc);
  d.tracks = (d.tracks ?? [])
    .map((t) => (t.target === target ? { ...t, keys: t.keys.filter((k) => k.frame !== frame) } : t))
    .filter((t) => t.keys.length > 0);
  const o = d.objects?.find((x) => x.id === target);
  if (o?.type === "rig" && o.poses) o.poses = o.poses.filter((k) => k.frame !== frame);
  return d;
}

/** All keyed frames for a target (tracks + pose keys), sorted, unique. */
export function keyFrames(doc: SceneDoc, target: string): number[] {
  const frames = new Set<number>();
  for (const t of doc.tracks ?? []) if (t.target === target) t.keys.forEach((k) => frames.add(k.frame));
  const o = getObject(doc, target);
  if (o?.type === "rig") (o.poses ?? []).forEach((k) => frames.add(k.frame));
  return [...frames].sort((a, b) => a - b);
}

/**
 * Commits an object transform edit. Animated properties (with a track) get a
 * key at `frame` (auto-key); static ones change the base transform.
 */
export function setTransform(doc: SceneDoc, id: string, prop: TransformProp, value: Vec3, frame: number): SceneDoc {
  if (findTrack(doc, id, prop)) return upsertKey(doc, id, prop, frame, value);
  const d = clone(doc);
  const o = d.objects!.find((x) => x.id === id)!;
  o.transform = { ...(o.transform ?? {}), [prop]: roundVec(value) };
  return d;
}

/** Keys position, rotation and scale of `id` at `frame` with the given (evaluated) values. */
export function keyTransform(doc: SceneDoc, id: string, frame: number, values: Record<TransformProp, Vec3>): SceneDoc {
  let d = doc;
  for (const prop of ["position", "rotation", "scale"] as const) d = upsertKey(d, id, prop, frame, values[prop]);
  return d;
}

/** Camera position/target/fov edit, with auto-key when that property is animated. */
export function setCameraProp(doc: SceneDoc, id: string, prop: "position" | "target" | "fov", value: number | Vec3, frame: number): SceneDoc {
  if (findTrack(doc, id, prop)) return upsertKey(doc, id, prop, frame, value);
  const d = clone(doc);
  const c = d.cameras.find((x) => x.id === id)!;
  (c as Record<string, unknown>)[prop] = typeof value === "number" ? round(value) : roundVec(value);
  return d;
}

/** Rig joint rotation edit: keys the joint track if animated, else sets a static override. */
export function setJointRotation(doc: SceneDoc, rigId: string, joint: string, value: Vec3, frame: number): SceneDoc {
  const property = `joint:${joint}`;
  if (findTrack(doc, rigId, property)) return upsertKey(doc, rigId, property, frame, value);
  const d = clone(doc);
  const o = d.objects!.find((x) => x.id === rigId);
  if (o?.type !== "rig") throw new Error(`${rigId} is not a rig`);
  o.joints = { ...(o.joints ?? {}), [joint]: roundVec(value) };
  return d;
}

export function clearJointOverride(doc: SceneDoc, rigId: string, joint: string): SceneDoc {
  const d = clone(doc);
  const o = d.objects!.find((x) => x.id === rigId);
  if (o?.type === "rig" && o.joints) {
    delete o.joints[joint];
    if (Object.keys(o.joints).length === 0) delete o.joints;
  }
  d.tracks = (d.tracks ?? []).filter((t) => !(t.target === rigId && t.property === `joint:${joint}`));
  return d;
}

/** Inserts or replaces a rig pose key at `frame`. */
export function keyPose(doc: SceneDoc, rigId: string, frame: number, pose: string): SceneDoc {
  const d = clone(doc);
  const o = d.objects!.find((x) => x.id === rigId);
  if (o?.type !== "rig") throw new Error(`${rigId} is not a rig`);
  const keys = (o.poses ?? []).filter((k) => k.frame !== frame);
  keys.push({ frame, pose });
  o.poses = keys.sort((a, b) => a.frame - b.frame);
  return d;
}

/** Shallow-merges fields into an object (type-specific fields included). */
export function patchObject(doc: SceneDoc, id: string, patch: Record<string, unknown>): SceneDoc {
  const d = clone(doc);
  const i = d.objects!.findIndex((x) => x.id === id);
  const merged: Record<string, unknown> = { ...d.objects![i], ...patch };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  d.objects![i] = merged as DocObject;
  return d;
}

export function patchCamera(doc: SceneDoc, id: string, patch: Partial<DocCamera>): SceneDoc {
  const d = clone(doc);
  const i = d.cameras.findIndex((x) => x.id === id);
  d.cameras[i] = { ...d.cameras[i], ...patch };
  return d;
}

export function patchScene(doc: SceneDoc, patch: Partial<SceneDoc>): SceneDoc {
  return { ...clone(doc), ...patch };
}

/** An id not used by any object or camera, based on `base` ("box" → "box", "box-2", …). */
export function uniqueId(doc: SceneDoc, base: string): string {
  const taken = new Set([...objects(doc).map((o) => o.id), ...doc.cameras.map((c) => c.id)]);
  const clean = base.replace(/[^a-zA-Z0-9_-]/g, "-") || "object";
  if (!taken.has(clean)) return clean;
  const stem = clean.replace(/-\d+$/, "");
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

export function addObject(doc: SceneDoc, obj: DocObject): SceneDoc {
  const d = clone(doc);
  d.objects = [...(d.objects ?? []), { ...obj, id: uniqueId(doc, obj.id) }];
  return d;
}

/** Ids of `id` and all its descendants. */
export function subtree(doc: SceneDoc, id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const o of objects(doc))
      if (o.parent && ids.has(o.parent) && !ids.has(o.id)) {
        ids.add(o.id);
        grew = true;
      }
  }
  return ids;
}

/** Deletes an object, its children and their tracks. */
export function deleteObject(doc: SceneDoc, id: string): SceneDoc {
  const gone = subtree(doc, id);
  const d = clone(doc);
  d.objects = objects(d).filter((o) => !gone.has(o.id));
  d.tracks = (d.tracks ?? []).filter((t) => !gone.has(t.target));
  return d;
}

/** Copies an object and its children (and their tracks) with fresh ids, nudged +0.5 m on X. */
export function duplicateObject(doc: SceneDoc, id: string): { doc: SceneDoc; newId: string } {
  const ids = subtree(doc, id);
  let d = clone(doc);
  const map = new Map<string, string>();
  for (const oid of ids) {
    const nid = uniqueId(d, oid);
    map.set(oid, nid);
    d = { ...d, objects: [...objects(d), { id: nid } as DocObject] }; // reserve the id
  }
  const copies = objects(doc)
    .filter((o) => ids.has(o.id))
    .map((o) => {
      const c = clone(o);
      c.id = map.get(o.id)!;
      if (c.parent && map.has(c.parent)) c.parent = map.get(c.parent);
      if (o.id === id) {
        const p = baseTransform(o, "position");
        c.transform = { ...(c.transform ?? {}), position: roundVec([p[0] + 0.5, p[1], p[2]]) };
      }
      return c;
    });
  const out = clone(doc);
  out.objects = [...objects(out), ...copies];
  const tracks = (doc.tracks ?? []).filter((t) => ids.has(t.target)).map((t) => ({ ...clone(t), target: map.get(t.target)! }));
  if (tracks.length) out.tracks = [...(out.tracks ?? []), ...tracks];
  return { doc: out, newId: map.get(id)! };
}

/** Renames an object or camera and updates every reference (parents, tracks, shots). */
export function renameId(doc: SceneDoc, from: string, to: string): SceneDoc {
  if (from === to) return doc;
  if (!/^[a-zA-Z0-9_-]+$/.test(to)) throw new Error("ids may only use letters, digits, _ and -");
  if (getObject(doc, to) || getCamera(doc, to)) throw new Error(`"${to}" is already used`);
  const d = clone(doc);
  for (const o of d.objects ?? []) {
    if (o.id === from) o.id = to;
    if (o.parent === from) o.parent = to;
  }
  for (const c of d.cameras) if (c.id === from) c.id = to;
  for (const t of d.tracks ?? []) if (t.target === from) t.target = to;
  for (const s of d.shots ?? []) if (s.camera === from) s.camera = to;
  return d;
}

/** Reparents an object, refusing cycles. */
export function setParent(doc: SceneDoc, id: string, parent: string | undefined): SceneDoc {
  if (parent && subtree(doc, id).has(parent)) throw new Error("cannot parent an object to itself or its child");
  return patchObject(doc, id, { parent });
}
