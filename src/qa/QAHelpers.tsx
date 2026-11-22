/** In-canvas QA helpers: fitted cameras, bounds box, 1.8 m scale figure. */
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { Vec3 } from "../scene/schema";
import type { Bounds } from "./stats";
import type { FittedCamera } from "./views";

/** Applies a fitted camera to the canvas's default camera (perspective or orthographic). */
export const FittedCameraRig: React.FC<{ camera: FittedCamera }> = ({ camera }) => {
  const cam = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    cam.position.set(...camera.position);
    cam.up.set(...camera.up);
    cam.near = camera.near;
    cam.far = camera.far;
    if (cam instanceof THREE.OrthographicCamera) {
      // R3F sizes the ortho frustum in pixels; zoom maps world units to pixels.
      cam.zoom = size.height / camera.viewHeight;
    } else if (cam instanceof THREE.PerspectiveCamera) {
      cam.fov = camera.fov;
    }
    cam.lookAt(...camera.target);
    cam.updateProjectionMatrix();
    invalidate();
  }, [cam, camera, size, invalidate]);
  return null;
};

export const BoundsBox: React.FC<{ bounds: Bounds; color?: string }> = ({ bounds, color = "#ffcc33" }) => {
  const box = useMemo(
    () => new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)),
    [bounds],
  );
  return <box3Helper args={[box, color]} />;
};

/** Height of the reference figure in metres. */
export const FIGURE_HEIGHT = 1.8;

/**
 * Where to stand the scale figure, on the floor beside the bounds: on the +X side,
 * or the +Z side (`side: "z"`) for left/right views so it doesn't hide the object.
 */
export function figurePosition(bounds: Bounds, side: "x" | "z" = "x"): Vec3 {
  if (side === "z") {
    const gap = Math.max(0.3, bounds.size[2] * 0.1);
    return [bounds.center[0], 0, bounds.max[2] + gap + 0.25];
  }
  const gap = Math.max(0.3, bounds.size[0] * 0.1);
  return [bounds.max[0] + gap + 0.25, 0, bounds.center[2]];
}

/** Bounds that include the scale figure, for framing. */
export function withFigure(bounds: Bounds, side: "x" | "z" = "x"): Bounds {
  const p = figurePosition(bounds, side);
  const min: Vec3 = [Math.min(bounds.min[0], p[0] - 0.4), Math.min(bounds.min[1], 0), Math.min(bounds.min[2], p[2] - 0.25)];
  const max: Vec3 = [Math.max(bounds.max[0], p[0] + 0.4), Math.max(bounds.max[1], FIGURE_HEIGHT), Math.max(bounds.max[2], p[2] + 0.25)];
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { min, max, size, center };
}

/** Translucent 1.8 m human silhouette for judging scale. */
export const ScaleFigure: React.FC<{ position: Vec3 }> = ({ position }) => {
  const mat = <meshBasicMaterial color="#ff8a3d" transparent opacity={0.45} depthWrite={false} />;
  return (
    <group position={position}>
      {/* legs + torso */}
      <mesh position={[0, 0.78, 0]}>
        <capsuleGeometry args={[0.19, 1.18, 2, 8]} />
        {mat}
      </mesh>
      {/* head */}
      <mesh position={[0, 1.685, 0]}>
        <sphereGeometry args={[0.115, 10, 8]} />
        {mat}
      </mesh>
      {/* height marker line */}
      <mesh position={[0.32, 0.9, 0]}>
        <boxGeometry args={[0.01, FIGURE_HEIGHT, 0.01]} />
        <meshBasicMaterial color="#ff8a3d" />
      </mesh>
    </group>
  );
};
