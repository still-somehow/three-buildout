/**
 * Expands rig objects into plain joint groups + part primitives, posed for
 * the current frame. Pure: (objects, frame) → objects.
 */
import * as THREE from "three";
import { easeValue } from "../scene/animation";
import { resolveColor } from "../scene/primitives";
import type { PoseKey, SceneObject, Vec3 } from "../scene/schema";
import { RIGS } from "./registry";
import type { Pose, RigDef } from "./types";

type RigObject = Extract<SceneObject, { type: "rig" }>;

const ZERO: Vec3 = [0, 0, 0];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Blend of two poses (t = 0 → a, 1 → b). Joints missing from a pose are at rest. */
export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const names = new Set([...Object.keys(a.rotations), ...Object.keys(b.rotations)]);
  const rotations: Pose["rotations"] = {};
  for (const n of names) rotations[n] = lerp3(a.rotations[n] ?? ZERO, b.rotations[n] ?? ZERO, t);
  return { rotations, rootOffset: lerp3(a.rootOffset ?? ZERO, b.rootOffset ?? ZERO, t) };
}

/** The pose of a rig instance at `frame`: pose keys (or static pose) + joint overrides. */
export function poseAt(def: RigDef, rig: Pick<RigObject, "pose" | "poses" | "joints">, frame: number): Pose {
  const lib = (name: string) => def.poses[name] ?? { rotations: {} };
  let pose: Pose;
  const keys: PoseKey[] = rig.poses;
  if (keys.length === 0) pose = lib(rig.pose);
  else if (frame <= keys[0].frame) pose = lib(keys[0].pose);
  else if (frame >= keys[keys.length - 1].frame) pose = lib(keys[keys.length - 1].pose);
  else {
    let i = 0;
    while (keys[i + 1].frame <= frame) i++;
    const t = (frame - keys[i].frame) / (keys[i + 1].frame - keys[i].frame);
    pose = blendPoses(lib(keys[i].pose), lib(keys[i + 1].pose), easeValue(keys[i].ease, t));
  }
  return { ...pose, rotations: { ...pose.rotations, ...rig.joints } };
}

function shade(color: string, factor: number): string {
  return "#" + new THREE.Color(resolveColor(color)).multiplyScalar(factor).getHexString();
}

/** Id of a rig instance's joint group, e.g. "actor/elbowL". */
export const jointId = (rigId: string, joint: string) => `${rigId}/${joint}`;
/** Id of a rig instance's body part, e.g. "actor/elbowL/forearmL". */
export const partId = (rigId: string, joint: string, part: string) => `${rigId}/${joint}/${part}`;

const checked = new WeakSet<RigDef>();
function checkDef(def: RigDef) {
  if (checked.has(def)) return;
  const joints = new Set<string>();
  for (const j of def.joints) {
    if (joints.has(j.name)) throw new Error(`Rig "${def.name}": duplicate joint "${j.name}"`);
    if (j.parent && !joints.has(j.parent)) throw new Error(`Rig "${def.name}": joint "${j.name}" listed before its parent "${j.parent}"`);
    joints.add(j.name);
  }
  const parts = new Set<string>();
  for (const p of def.parts) {
    if (parts.has(p.name)) throw new Error(`Rig "${def.name}": duplicate part "${p.name}"`);
    if (!joints.has(p.joint)) throw new Error(`Rig "${def.name}": part "${p.name}" on unknown joint "${p.joint}"`);
    parts.add(p.name);
  }
  if (!joints.has(def.rootJoint)) throw new Error(`Rig "${def.name}": unknown rootJoint "${def.rootJoint}"`);
  checked.add(def);
}

/** Replaces each rig object with its posed joint/part objects. Other objects pass through. */
export function expandRigs(objects: SceneObject[], frame: number): SceneObject[] {
  if (!objects.some((o) => o.type === "rig")) return objects;
  const out: SceneObject[] = [];
  for (const o of objects) {
    if (o.type !== "rig") {
      out.push(o);
      continue;
    }
    const def = RIGS[o.rig];
    if (!def) throw new Error(`Unknown rig "${o.rig}"`);
    checkDef(def);
    const pose = poseAt(def, o, frame);
    const k = (o.height ?? def.height) / def.height;
    const base = { visible: true as const };

    // Root group keeps the rig's id, parent and transform; height scales it.
    out.push({
      id: o.id,
      name: o.name,
      parent: o.parent,
      visible: o.visible,
      notes: o.notes,
      type: "group",
      transform: { ...o.transform, scale: [o.transform.scale[0] * k, o.transform.scale[1] * k, o.transform.scale[2] * k] },
    });
    for (const j of def.joints) {
      const r = j.name === def.rootJoint ? (pose.rootOffset ?? ZERO) : ZERO;
      const offset: Vec3 = [j.offset[0] + r[0], j.offset[1] + r[1], j.offset[2] + r[2]];
      out.push({
        ...base,
        id: jointId(o.id, j.name),
        parent: j.parent ? jointId(o.id, j.parent) : o.id,
        type: "group",
        rigJoint: j.name,
        transform: { position: offset, rotation: pose.rotations[j.name] ?? ZERO, scale: [1, 1, 1] },
      });
    }
    for (const p of def.parts) {
      out.push({
        ...base,
        id: partId(o.id, p.joint, p.name),
        parent: jointId(o.id, p.joint),
        type: "primitive",
        rigPart: true,
        shape: p.shape,
        pivot: p.pivot ?? "bottom",
        color: p.color ?? (p.side === "L" ? shade(o.color, 0.78) : o.color),
        transform: { position: p.offset ?? ZERO, rotation: p.rotation ?? ZERO, scale: [1, 1, 1] },
      });
    }
  }
  return out;
}
