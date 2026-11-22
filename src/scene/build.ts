/**
 * Builds a plain three.js object tree from a scene — no React, no renderer.
 * Used for stats/bounds (works in Node and the browser). The React renderer
 * (SceneContent) uses the same helpers so the two never disagree.
 */
import * as THREE from "three";
import { buildGeometry, shapeHeight } from "./primitives";
import type { Scene, SceneObject, Shape } from "./schema";

const DEG = Math.PI / 180;

export function pivotOffsetY(shape: Shape, pivot: "bottom" | "center" | "top"): number {
  const h = shapeHeight(shape);
  return pivot === "bottom" ? h / 2 : pivot === "top" ? -h / 2 : 0;
}

export function applyTransform(obj: THREE.Object3D, o: SceneObject) {
  const { position, rotation, scale } = o.transform;
  obj.position.set(...position);
  obj.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG);
  obj.scale.set(...scale);
}

export type BuiltScene = {
  root: THREE.Group;
  /** Scene object id → its transform node. */
  nodes: Map<string, THREE.Object3D>;
  /** Scene object id → mesh (primitives only). */
  meshes: Map<string, THREE.Mesh>;
  dispose(): void;
};

export function buildObject3D(scene: Pick<Scene, "objects">): BuiltScene {
  const root = new THREE.Group();
  const nodes = new Map<string, THREE.Object3D>();
  const meshes = new Map<string, THREE.Mesh>();

  for (const o of scene.objects) {
    const node = new THREE.Group();
    node.name = o.id;
    applyTransform(node, o);
    node.visible = o.visible;
    if (o.type === "primitive") {
      const mesh = new THREE.Mesh(buildGeometry(o.shape));
      mesh.position.y = pivotOffsetY(o.shape, o.pivot);
      mesh.userData.sceneObjectId = o.id;
      node.add(mesh);
      meshes.set(o.id, mesh);
    }
    nodes.set(o.id, node);
  }
  for (const o of scene.objects) {
    const parent = o.parent ? nodes.get(o.parent) : root;
    (parent ?? root).add(nodes.get(o.id)!);
  }
  root.updateMatrixWorld(true);

  return {
    root,
    nodes,
    meshes,
    dispose: () => meshes.forEach((m) => m.geometry.dispose()),
  };
}
