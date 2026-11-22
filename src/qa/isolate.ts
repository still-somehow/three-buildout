import * as THREE from "three";
import { buildObject3D } from "../scene/build";
import type { Scene, SceneObject } from "../scene/schema";

const RAD = 180 / Math.PI;

/** Ids of `id` and all its descendants. */
export function subtreeIds(scene: Pick<Scene, "objects">, id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of scene.objects) {
      if (o.parent && ids.has(o.parent) && !ids.has(o.id)) {
        ids.add(o.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * Scene containing only `id` and its descendants. The subtree keeps its world
 * placement (the root's transform becomes its world transform), so QA views
 * show it exactly where it sits in the scene. Tracks and shots are dropped.
 */
export function isolateSubtree<S extends Scene>(scene: S, id: string): S {
  const root = scene.objects.find((o) => o.id === id);
  if (!root) throw new Error(`No object "${id}" in scene "${scene.name}"`);
  const ids = subtreeIds(scene, id);

  const built = buildObject3D(scene);
  const node = built.nodes.get(id)!;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  node.matrixWorld.decompose(pos, quat, scale);
  const euler = new THREE.Euler().setFromQuaternion(quat, "XYZ");
  built.dispose();

  const rootWorld: SceneObject = {
    ...root,
    parent: undefined,
    transform: {
      position: [pos.x, pos.y, pos.z],
      rotation: [euler.x * RAD, euler.y * RAD, euler.z * RAD],
      scale: [scale.x, scale.y, scale.z],
    },
  };

  return {
    ...scene,
    objects: scene.objects.filter((o) => ids.has(o.id)).map((o) => (o.id === id ? rootWorld : o)),
    tracks: [],
    shots: [],
  };
}
