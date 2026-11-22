/**
 * Scene file format (scenes/*.scene.json).
 *
 * Conventions: metres, Y-up, rotations in DEGREES (XYZ euler), frames are
 * integers at the scene's fps. Objects form a hierarchy via `parent` ids.
 */
import { z } from "zod";
import { RIGS } from "../rig/registry";

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const Transform = z.object({
  position: Vec3.default([0, 0, 0]),
  /** Degrees, XYZ order. */
  rotation: Vec3.default([0, 0, 0]),
  scale: Vec3.default([1, 1, 1]),
});
export type Transform = z.infer<typeof Transform>;

/** Where a primitive's local origin sits. "bottom" makes ground placement trivial. */
export const Pivot = z.enum(["bottom", "center", "top"]);

const Segments = z.number().int().min(3).max(64);

export const Shape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("box"), size: Vec3.default([1, 1, 1]) }),
  z.object({
    kind: z.literal("cylinder"),
    radiusTop: z.number().positive().default(0.5),
    radiusBottom: z.number().positive().default(0.5),
    height: z.number().positive().default(1),
    segments: Segments.default(8),
  }),
  z.object({
    kind: z.literal("cone"),
    radius: z.number().positive().default(0.5),
    height: z.number().positive().default(1),
    segments: Segments.default(8),
  }),
  z.object({
    kind: z.literal("sphere"),
    radius: z.number().positive().default(0.5),
    segments: Segments.default(8),
  }),
  z.object({
    kind: z.literal("capsule"),
    radius: z.number().positive().default(0.25),
    /** Total height including the caps. */
    height: z.number().positive().default(1),
    segments: Segments.default(8),
  }),
  /** Triangular prism: ramp rising along +Z. size = [width, height, depth]. */
  z.object({ kind: z.literal("wedge"), size: Vec3.default([1, 1, 1]) }),
  /** Flat ground/wall quad lying in XZ, facing +Y. size = [width, depth]. */
  z.object({
    kind: z.literal("plane"),
    size: z.tuple([z.number(), z.number()]).default([10, 10]),
  }),
]);
export type Shape = z.infer<typeof Shape>;

/** Hex colour or a name from the greybox palette (see primitives.ts). */
export const Color = z.string().default("grey");

const ObjectBase = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "ids: letters, digits, _ and -"),
  name: z.string().optional(),
  parent: z.string().optional(),
  visible: z.boolean().default(true),
  transform: Transform.default({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }),
  notes: z.string().optional(),
  /** Set by the rig expander on generated joint groups (not for hand-written scenes). */
  rigJoint: z.string().optional(),
  /** Set by the rig expander on generated body parts. */
  rigPart: z.boolean().optional(),
});

export const PoseKey = z.object({
  frame: z.number().int().min(0),
  pose: z.string(),
  /** Easing used from this key to the next one. */
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "step"]).default("easeInOut"),
});
export type PoseKey = z.infer<typeof PoseKey>;

export const SceneObject = z.discriminatedUnion("type", [
  ObjectBase.extend({
    type: z.literal("primitive"),
    shape: Shape,
    color: Color,
    pivot: Pivot.default("bottom"),
  }),
  /** Empty transform node for grouping/parenting. */
  ObjectBase.extend({ type: z.literal("group") }),
  /**
   * A posable rigid rig (see src/rig). Expands at render time into joint groups
   * and body-part primitives with ids "<id>/<joint>" and "<id>/<joint>/<part>".
   */
  ObjectBase.extend({
    type: z.literal("rig"),
    rig: z.string().default("humanoid"),
    color: Color,
    /** Resize uniformly to this height in metres (default: the rig's own height). */
    height: z.number().positive().optional(),
    /** Static pose from the rig's pose library. */
    pose: z.string().default("stand"),
    /** Animated poses: blends between library poses over time (overrides `pose`). */
    poses: z.array(PoseKey).default([]),
    /** Per-joint rotation overrides in degrees, applied on top of the pose. */
    joints: z.record(z.string(), Vec3).default({}),
  }),
]);
export type SceneObject = z.infer<typeof SceneObject>;

export const Camera = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().optional(),
  position: Vec3,
  target: Vec3.default([0, 1, 0]),
  /** Vertical field of view, degrees. */
  fov: z.number().min(1).max(170).default(40),
  near: z.number().positive().default(0.05),
  far: z.number().positive().default(500),
});
export type Camera = z.infer<typeof Camera>;

export const Light = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ambient"),
    color: z.string().default("#ffffff"),
    intensity: z.number().default(0.4),
  }),
  z.object({
    type: z.literal("hemisphere"),
    sky: z.string().default("#dfe6ee"),
    ground: z.string().default("#4a4640"),
    intensity: z.number().default(1.2),
  }),
  z.object({
    type: z.literal("directional"),
    color: z.string().default("#ffffff"),
    intensity: z.number().default(1.6),
    position: Vec3.default([6, 10, 4]),
    target: Vec3.default([0, 0, 0]),
  }),
  z.object({
    type: z.literal("point"),
    color: z.string().default("#ffffff"),
    intensity: z.number().default(5),
    position: Vec3,
    distance: z.number().min(0).default(0),
  }),
]);
export type Light = z.infer<typeof Light>;

export const Ease = z.enum(["linear", "easeIn", "easeOut", "easeInOut", "step"]);
export type Ease = z.infer<typeof Ease>;

export const Keyframe = z.object({
  frame: z.number().int().min(0),
  value: z.union([z.number(), Vec3]),
  /** Easing used from this key to the next one. */
  ease: Ease.default("easeInOut"),
});
export type Keyframe = z.infer<typeof Keyframe>;

/** Transform/camera properties, or "joint:<name>" for a rig joint's rotation. */
export const TrackProperty = z.union([
  z.enum(["position", "rotation", "scale", "target", "fov"]),
  z.string().regex(/^joint:[A-Za-z0-9_]+$/, 'use "joint:<jointName>"'),
]);
export type TrackProperty = z.infer<typeof TrackProperty>;

export const Track = z.object({
  /** An object id or a camera id. */
  target: z.string(),
  property: TrackProperty,
  keys: z.array(Keyframe).min(1),
});
export type Track = z.infer<typeof Track>;

/** A camera cut. Shots are both storyboard panels and export units. */
export const Shot = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().optional(),
  camera: z.string(),
  start: z.number().int().min(0),
  /** Exclusive. */
  end: z.number().int().min(1),
  notes: z.string().optional(),
});
export type Shot = z.infer<typeof Shot>;

export const Settings = z.object({
  background: z.string().default("#2b2d31"),
  grid: z.boolean().default(true),
  /** Dark outlines on every primitive — reads well in greybox. */
  edges: z.boolean().default(true),
  /** Shadows are slow on CPU WebGL; enable per scene for final frames. */
  shadows: z.boolean().default(false),
});

const DEFAULT_LIGHTS: z.input<typeof Light>[] = [
  { type: "hemisphere" },
  { type: "directional" },
];

export const SceneSchema = z
  .object({
    version: z.literal(1).default(1),
    name: z.string(),
    fps: z.number().int().positive().default(24),
    width: z.number().int().positive().default(1280),
    height: z.number().int().positive().default(720),
    durationInFrames: z.number().int().positive(),
    settings: Settings.default({
      background: "#2b2d31",
      grid: true,
      edges: true,
      shadows: false,
    }),
    lights: z.array(Light).default(() => DEFAULT_LIGHTS.map((l) => Light.parse(l))),
    cameras: z.array(Camera).min(1),
    objects: z.array(SceneObject).default([]),
    tracks: z.array(Track).default([]),
    shots: z.array(Shot).default([]),
  })
  .superRefine((scene, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const objectIds = new Set<string>();
    scene.objects.forEach((o, i) => {
      if (objectIds.has(o.id)) issue(["objects", i, "id"], `duplicate object id "${o.id}"`);
      objectIds.add(o.id);
    });
    const cameraIds = new Set<string>();
    scene.cameras.forEach((c, i) => {
      if (cameraIds.has(c.id) || objectIds.has(c.id))
        issue(["cameras", i, "id"], `duplicate id "${c.id}"`);
      cameraIds.add(c.id);
    });

    const byId = new Map(scene.objects.map((o) => [o.id, o]));

    scene.objects.forEach((o, i) => {
      if (o.type !== "rig") return;
      const def = RIGS[o.rig];
      if (!def) {
        issue(["objects", i, "rig"], `unknown rig "${o.rig}" (available: ${Object.keys(RIGS).join(", ")})`);
        return;
      }
      const poseNames = Object.keys(def.poses).join(", ");
      if (!def.poses[o.pose]) issue(["objects", i, "pose"], `unknown pose "${o.pose}" (available: ${poseNames})`);
      o.poses.forEach((k, j) => {
        if (!def.poses[k.pose]) issue(["objects", i, "poses", j, "pose"], `unknown pose "${k.pose}" (available: ${poseNames})`);
        if (j > 0 && k.frame <= o.poses[j - 1].frame)
          issue(["objects", i, "poses", j, "frame"], "pose frames must be strictly increasing");
      });
      const jointNames = new Set(def.joints.map((jt) => jt.name));
      for (const name of Object.keys(o.joints))
        if (!jointNames.has(name)) issue(["objects", i, "joints", name], `unknown joint "${name}" on rig "${o.rig}"`);
    });
    scene.objects.forEach((o, i) => {
      if (o.parent === undefined) return;
      if (!byId.has(o.parent)) {
        issue(["objects", i, "parent"], `unknown parent "${o.parent}"`);
        return;
      }
      // Cycle check.
      const seen = new Set([o.id]);
      let p: string | undefined = o.parent;
      while (p !== undefined) {
        if (seen.has(p)) {
          issue(["objects", i, "parent"], `parent cycle through "${p}"`);
          break;
        }
        seen.add(p);
        p = byId.get(p)?.parent;
      }
    });

    scene.tracks.forEach((t, i) => {
      const isCam = cameraIds.has(t.target);
      if (!isCam && !objectIds.has(t.target))
        issue(["tracks", i, "target"], `unknown target "${t.target}"`);
      if (isCam && (t.property === "rotation" || t.property === "scale"))
        issue(["tracks", i, "property"], `cameras animate position/target/fov, not ${t.property}`);
      if (!isCam && (t.property === "target" || t.property === "fov"))
        issue(["tracks", i, "property"], `objects cannot animate ${t.property}`);
      if (t.property.startsWith("joint:")) {
        const o = byId.get(t.target);
        const joint = t.property.slice("joint:".length);
        if (o?.type !== "rig") issue(["tracks", i, "property"], "joint tracks need a rig target");
        else if (RIGS[o.rig] && !RIGS[o.rig].joints.some((jt) => jt.name === joint))
          issue(["tracks", i, "property"], `unknown joint "${joint}" on rig "${o.rig}"`);
      }
      const scalar = t.property === "fov";
      t.keys.forEach((k, j) => {
        if (scalar !== (typeof k.value === "number"))
          issue(["tracks", i, "keys", j, "value"], scalar ? "expected a number" : "expected [x, y, z]");
        if (j > 0 && k.frame <= t.keys[j - 1].frame)
          issue(["tracks", i, "keys", j, "frame"], "key frames must be strictly increasing");
      });
    });

    const shotIds = new Set<string>();
    scene.shots.forEach((s, i) => {
      if (shotIds.has(s.id)) issue(["shots", i, "id"], `duplicate shot id "${s.id}"`);
      shotIds.add(s.id);
      if (!cameraIds.has(s.camera)) issue(["shots", i, "camera"], `unknown camera "${s.camera}"`);
      if (s.end <= s.start) issue(["shots", i, "end"], "end must be after start");
      if (s.end > scene.durationInFrames)
        issue(["shots", i, "end"], `end ${s.end} exceeds durationInFrames ${scene.durationInFrames}`);
    });
  });

/** A fully parsed scene (all defaults filled in). */
export type Scene = z.infer<typeof SceneSchema>;
/** What a hand-written scene file may contain (defaults optional). */
export type SceneInput = z.input<typeof SceneSchema>;

export function parseScene(data: unknown, source = "scene"): Scene {
  const result = SceneSchema.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid ${source}:\n${lines.join("\n")}`);
  }
  return result.data;
}
