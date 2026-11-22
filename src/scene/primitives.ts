/** Geometry builders and the greybox colour palette. */
import * as THREE from "three";
import type { Shape } from "./schema";

/** Muted greybox palette. Tints let you tell characters/props apart without "art". */
export const PALETTE: Record<string, string> = {
  grey: "#9c9c9c",
  light: "#c9c9c9",
  dark: "#5c5c5c",
  floor: "#6f6f6f",
  wall: "#8a8a8a",
  red: "#b56a5f",
  orange: "#c08a55",
  yellow: "#c4b25e",
  green: "#6fa36b",
  teal: "#5c9c9a",
  blue: "#6080b5",
  purple: "#8e70ad",
};

export function resolveColor(color: string): string {
  return PALETTE[color] ?? color;
}

/** Height of the shape along Y (used for pivot placement). */
export function shapeHeight(shape: Shape): number {
  switch (shape.kind) {
    case "box":
    case "wedge":
      return shape.size[1];
    case "cylinder":
    case "cone":
    case "capsule":
      return shape.height;
    case "sphere":
      return shape.radius * 2;
    case "plane":
      return 0;
  }
}

/** Builds a centred geometry (origin at the shape's bounding-box centre). */
export function buildGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case "box":
      return new THREE.BoxGeometry(...shape.size);
    case "cylinder":
      return new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, shape.segments);
    case "cone":
      return new THREE.ConeGeometry(shape.radius, shape.height, shape.segments);
    case "sphere":
      return new THREE.SphereGeometry(shape.radius, shape.segments, Math.max(2, Math.round(shape.segments * 0.75)));
    case "capsule": {
      const length = Math.max(0, shape.height - shape.radius * 2);
      return new THREE.CapsuleGeometry(shape.radius, length, Math.max(1, Math.round(shape.segments / 4)), shape.segments);
    }
    case "wedge":
      return wedgeGeometry(shape.size[0], shape.size[1], shape.size[2]);
    case "plane": {
      const g = new THREE.PlaneGeometry(shape.size[0], shape.size[1]);
      g.rotateX(-Math.PI / 2);
      return g;
    }
  }
}

/** Triangular prism: full height at +Z, zero at -Z. Centred like a box. */
function wedgeGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const shape = new THREE.Shape();
  // Profile in the ZY plane (shape x → world z).
  shape.moveTo(-z, -y);
  shape.lineTo(z, -y);
  shape.lineTo(z, y);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  // Extrusion runs along +Z; rotate so the profile lies in ZY and extrusion runs along X.
  g.rotateY(-Math.PI / 2);
  g.translate(x, 0, 0);
  g.computeVertexNormals();
  return g;
}
