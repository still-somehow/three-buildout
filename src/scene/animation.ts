/**
 * Keyframe evaluation. Everything here is a pure function of (scene, frame)
 * so renders are deterministic and frames can be rendered in any order.
 */
import { expandRigs } from "../rig/expand";
import type { Camera, Ease, Keyframe, Scene, SceneObject, Shot, Track, Vec3 } from "./schema";

const EASES: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - (1 - t) ** 3,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  step: () => 0,
};

export const easeValue = (ease: Ease, t: number) => EASES[ease](t);

function lerpValue(a: number | Vec3, b: number | Vec3, t: number): number | Vec3 {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b))
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  throw new Error("Cannot interpolate between a number and a vector");
}

/** Value of a keyframe list at `frame`; holds the first/last key outside the range. */
export function evaluateKeys(keys: Keyframe[], frame: number): number | Vec3 {
  if (keys.length === 0) throw new Error("Track has no keys");
  if (frame <= keys[0].frame) return keys[0].value;
  const last = keys[keys.length - 1];
  if (frame >= last.frame) return last.value;
  // Keys are validated as strictly increasing.
  let i = 0;
  while (keys[i + 1].frame <= frame) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (frame - a.frame) / (b.frame - a.frame);
  return lerpValue(a.value, b.value, EASES[a.ease](t));
}

/**
 * A scene evaluated at one frame: animated values applied and rigs expanded into
 * plain joint groups and part primitives (so it contains no "rig" objects).
 */
export type ResolvedScene = Scene & { frame: number };

/** Returns a copy of the scene with every animated property set to its value at `frame`. */
export function resolveScene(scene: Scene, frame: number): ResolvedScene {
  if (scene.tracks.length === 0) return { ...scene, frame, objects: expandRigs(scene.objects, frame) };

  const objects = new Map(scene.objects.map((o) => [o.id, o]));
  const cameras = new Map(scene.cameras.map((c) => [c.id, c]));

  for (const track of scene.tracks) {
    const value = evaluateKeys(track.keys, frame);
    applyTrack(track, value, objects, cameras);
  }

  return {
    ...scene,
    frame,
    objects: expandRigs(
      scene.objects.map((o) => objects.get(o.id)!),
      frame,
    ),
    cameras: scene.cameras.map((c) => cameras.get(c.id)!),
  };
}

function applyTrack(
  track: Track,
  value: number | Vec3,
  objects: Map<string, SceneObject>,
  cameras: Map<string, Camera>,
) {
  const cam = cameras.get(track.target);
  if (cam) {
    if (track.property === "fov") cameras.set(cam.id, { ...cam, fov: value as number });
    else if (track.property === "position" || track.property === "target")
      cameras.set(cam.id, { ...cam, [track.property]: value as Vec3 });
    return;
  }
  const obj = objects.get(track.target);
  if (obj?.type === "rig" && track.property.startsWith("joint:")) {
    const joint = track.property.slice("joint:".length);
    objects.set(obj.id, { ...obj, joints: { ...obj.joints, [joint]: value as Vec3 } });
    return;
  }
  if (obj && (track.property === "position" || track.property === "rotation" || track.property === "scale")) {
    objects.set(obj.id, { ...obj, transform: { ...obj.transform, [track.property]: value as Vec3 } });
  }
}

/** The shot covering `frame` (shots are camera cuts), if any. */
export function shotAt(scene: Scene, frame: number): Shot | undefined {
  return scene.shots.find((s) => frame >= s.start && frame < s.end);
}

/** Camera to render at `frame`: the explicit id, else the current shot's, else the first camera. */
export function activeCamera(scene: Scene, frame: number, cameraId?: string): Camera {
  const id = cameraId ?? shotAt(scene, frame)?.camera;
  return scene.cameras.find((c) => c.id === id) ?? scene.cameras[0];
}
