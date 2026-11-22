/**
 * Rigid segmented rigs: a joint hierarchy, with low-poly parts bound rigidly to
 * joints (no skinning). A rig instance in a scene expands into plain groups
 * (joints) and primitives (parts), so everything downstream just works.
 */
import type { Shape, Vec3 } from "../scene/schema";

export type JointDef = {
  name: string;
  parent?: string;
  /** Rest position relative to the parent joint (or the rig root), metres. */
  offset: Vec3;
  /** Human-readable rotation conventions, shown in docs/QA. */
  doc?: string;
};

export type PartDef = {
  name: string;
  joint: string;
  shape: Shape;
  pivot?: "bottom" | "center" | "top";
  /** Placement relative to the joint. */
  offset?: Vec3;
  rotation?: Vec3;
  /** Left-side parts are tinted darker so left/right read at a glance. */
  side?: "L" | "R";
  /** Fixed colour (palette name or hex) instead of the instance colour. */
  color?: string;
};

/** Joint rotations in degrees (local XYZ euler); missing joints stay at rest. */
export type Pose = {
  rotations: Record<string, Vec3>;
  /** Moves the root joint (e.g. lowers the hips to sit). */
  rootOffset?: Vec3;
  description?: string;
};

export type RigDef = {
  name: string;
  /** Rest-pose height in metres (instances can be resized with `height`). */
  height: number;
  /** The joint that `rootOffset` moves. */
  rootJoint: string;
  joints: JointDef[];
  parts: PartDef[];
  poses: Record<string, Pose>;
};
