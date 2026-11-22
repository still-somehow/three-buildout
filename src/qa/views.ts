/** Standard QA views and the maths that frames them on a bounding box. */
import type { Vec3 } from "../scene/schema";
import type { Bounds } from "./stats";

export type ViewName = "front" | "back" | "left" | "right" | "top" | "persp" | "persp-back";

export type ViewSpec = {
  label: string;
  ortho: boolean;
  /** Direction from the target towards the camera. */
  dir: Vec3;
  up: Vec3;
};

export const VIEWS: Record<ViewName, ViewSpec> = {
  front: { label: "FRONT  (ortho, from +Z)", ortho: true, dir: [0, 0, 1], up: [0, 1, 0] },
  back: { label: "BACK  (ortho, from −Z)", ortho: true, dir: [0, 0, -1], up: [0, 1, 0] },
  right: { label: "RIGHT  (ortho, from +X)", ortho: true, dir: [1, 0, 0], up: [0, 1, 0] },
  left: { label: "LEFT  (ortho, from −X)", ortho: true, dir: [-1, 0, 0], up: [0, 1, 0] },
  // Up = −Z so the model's front (+Z) is at the bottom of the frame.
  top: { label: "TOP  (ortho, from +Y)", ortho: true, dir: [0, 1, 0], up: [0, 0, -1] },
  persp: { label: "3/4 PERSPECTIVE", ortho: false, dir: [1, 0.65, 1.25], up: [0, 1, 0] },
  "persp-back": { label: "3/4 BACK", ortho: false, dir: [-1.1, 0.7, -1.2], up: [0, 1, 0] },
};

export type FittedCamera = {
  ortho: boolean;
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov: number;
  near: number;
  far: number;
  /** Ortho only: world units visible across the frame's width/height. */
  viewWidth: number;
  viewHeight: number;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Frames `bounds` in a view of aspect `aspect` (w/h) with `margin` (1.15 = 15% padding).
 * `azimuthDeg` rotates the view direction around Y (for turntables).
 */
export function fitView(view: ViewSpec, bounds: Bounds, aspect: number, margin = 1.15, azimuthDeg = 0): FittedCamera {
  const [sx, sy, sz] = bounds.size.map((s) => Math.max(s, 0.01)) as Vec3;
  const c = bounds.center;
  const radius = Math.hypot(sx, sy, sz) / 2;
  const a = (azimuthDeg * Math.PI) / 180;
  const d0 = norm(view.dir);
  const dir: Vec3 = [d0[0] * Math.cos(a) + d0[2] * Math.sin(a), d0[1], -d0[0] * Math.sin(a) + d0[2] * Math.cos(a)];
  const fov = 35;

  let viewWidth = 0;
  let viewHeight = 0;
  let dist: number;
  if (view.ortho) {
    // Extent of the box as seen along each axis-aligned view.
    const [w, h] = Math.abs(dir[1]) > 0.9 ? [sx, sz] : Math.abs(dir[0]) > 0.9 ? [sz, sy] : [sx, sy];
    viewHeight = Math.max(h, w / aspect) * margin;
    viewWidth = viewHeight * aspect;
    dist = radius * 4 + 1;
  } else {
    // Fit the 8 box corners exactly: for each corner find the distance at which it
    // just fits inside the (margin-shrunk) frustum, and take the largest.
    const tanV = Math.tan((fov * Math.PI) / 360) / margin;
    const tanH = tanV * aspect;
    const right = norm(cross(view.up, dir));
    const up = cross(dir, right);
    dist = radius;
    for (const x of [-sx / 2, sx / 2])
      for (const y of [-sy / 2, sy / 2])
        for (const z of [-sz / 2, sz / 2]) {
          const p: Vec3 = [x, y, z];
          const depth = dot(p, dir); // towards the camera
          dist = Math.max(dist, depth + Math.abs(dot(p, right)) / tanH, depth + Math.abs(dot(p, up)) / tanV);
        }
  }

  return {
    ortho: view.ortho,
    position: [c[0] + dir[0] * dist, c[1] + dir[1] * dist, c[2] + dir[2] * dist],
    target: c,
    up: view.up,
    fov,
    near: Math.max(0.01, dist - radius * 3),
    far: dist + radius * 3,
    viewWidth,
    viewHeight,
  };
}
