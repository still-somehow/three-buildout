import { resolveScene, type ResolvedScene } from "../../scene/animation";
import type { Scene } from "../../scene/schema";
import { isolateSubtree } from "../../qa/isolate";
import { computeStats, type Bounds, type SceneStats } from "../../qa/stats";

export type QAProps = {
  scene: Scene;
  /** Isolate this object and its children (keeps its world placement). */
  objectId?: string;
  /** Scene frame to inspect (animated values are evaluated here). */
  frame?: number;
  /** Image under public/, e.g. "refs/chair.jpg", shown beside the views. */
  reference?: string;
};

export type PreparedQA = { scene: ResolvedScene; stats: SceneStats; bounds: Bounds };

const UNIT: Bounds = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], size: [1, 1, 1], center: [0, 0.5, 0] };

export function prepareQA({ scene, objectId, frame = 0 }: QAProps): PreparedQA {
  let resolved = resolveScene(scene, frame);
  if (objectId) resolved = isolateSubtree(resolved, objectId);
  const stats = computeStats(resolved);
  return { scene: resolved, stats, bounds: stats.bounds ?? UNIT };
}

export const fmt = (n: number) => n.toFixed(2);
