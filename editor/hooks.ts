import { useMemo } from "react";
import * as THREE from "three";
import { resolveScene, type ResolvedScene } from "../src/scene/animation";
import { useEditor } from "./store";

/** The current scene evaluated at the current frame (rigs expanded). */
export function useResolved(): ResolvedScene | null {
  const parsed = useEditor((s) => s.parsed);
  const frame = useEditor((s) => s.frame);
  return useMemo(() => (parsed ? resolveScene(parsed, frame) : null), [parsed, frame]);
}

/** The free orbit view's camera + target, written by the viewport (for "set camera from view"). */
export const orbitView = { position: new THREE.Vector3(6, 4, 8), target: new THREE.Vector3(0, 1, 0), fov: 45 };
// Exposed for the end-to-end test (scripts/editor-e2e.ts), which projects points through it.
(globalThis as { __orbitView?: typeof orbitView }).__orbitView = orbitView;
