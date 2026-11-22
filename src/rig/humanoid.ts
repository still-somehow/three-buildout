/**
 * 1.8 m segmented mannequin. Faces +Z; the character's left is +X.
 * Rest pose: standing straight, arms hanging at the sides.
 *
 * Rotation cheat-sheet (degrees, local XYZ):
 *   spine/chest  x+ lean forward · y twist (y+ = turn to own left) · z side-bend
 *   neck/head    x+ nod down     · y+ look to own left
 *   shoulder     x− raise forward · z+ (L) / z− (R) raise sideways
 *   elbow        x− bend (forearm forward) · z also works once the arm is raised
 *   wrist        x± flex
 *   hip          x− leg forward · z+ (L) / z− (R) leg out
 *   knee         x+ bend (shin back)
 *   ankle        x+ toes down
 */
import type { Pose, RigDef } from "./types";

const box = (w: number, h: number, d: number) => ({ kind: "box" as const, size: [w, h, d] as [number, number, number] });
const capsule = (radius: number, height: number) => ({ kind: "capsule" as const, radius, height, segments: 8 });

const joints: RigDef["joints"] = [
  { name: "hips", offset: [0, 0.98, 0] },
  { name: "spine", parent: "hips", offset: [0, 0.1, 0] },
  { name: "chest", parent: "spine", offset: [0, 0.2, 0] },
  { name: "neck", parent: "chest", offset: [0, 0.24, 0] },
  { name: "head", parent: "neck", offset: [0, 0.08, 0] },
  ...(["L", "R"] as const).flatMap((s) => {
    const x = s === "L" ? 1 : -1;
    return [
      { name: `shoulder${s}`, parent: "chest", offset: [0.225 * x, 0.19, 0] as [number, number, number] },
      { name: `elbow${s}`, parent: `shoulder${s}`, offset: [0, -0.3, 0] as [number, number, number] },
      { name: `wrist${s}`, parent: `elbow${s}`, offset: [0, -0.26, 0] as [number, number, number] },
      { name: `hip${s}`, parent: "hips", offset: [0.1 * x, -0.05, 0] as [number, number, number] },
      { name: `knee${s}`, parent: `hip${s}`, offset: [0, -0.44, 0] as [number, number, number] },
      { name: `ankle${s}`, parent: `knee${s}`, offset: [0, -0.42, 0] as [number, number, number] },
    ];
  }),
];

const parts: RigDef["parts"] = [
  { name: "pelvis", joint: "hips", shape: box(0.32, 0.18, 0.2), pivot: "center", offset: [0, -0.02, 0] },
  { name: "abdomen", joint: "spine", shape: box(0.28, 0.2, 0.18) },
  { name: "torso", joint: "chest", shape: box(0.36, 0.26, 0.22) },
  { name: "neck", joint: "neck", shape: { kind: "cylinder", radiusTop: 0.05, radiusBottom: 0.055, height: 0.1, segments: 6 } },
  { name: "head", joint: "head", shape: box(0.17, 0.21, 0.2), offset: [0, -0.01, 0.01] },
  // Facing indicator: the mannequin's front is +Z.
  {
    name: "nose",
    joint: "head",
    shape: { kind: "cone", radius: 0.025, height: 0.06, segments: 4 },
    pivot: "center",
    offset: [0, 0.1, 0.13],
    rotation: [90, 0, 0],
    color: "dark",
  },
  ...(["L", "R"] as const).flatMap((s) => [
    { name: `upperArm${s}`, joint: `shoulder${s}`, shape: capsule(0.05, 0.31), pivot: "top" as const, offset: [0, 0.02, 0] as [number, number, number], side: s },
    { name: `forearm${s}`, joint: `elbow${s}`, shape: capsule(0.045, 0.27), pivot: "top" as const, offset: [0, 0.01, 0] as [number, number, number], side: s },
    { name: `hand${s}`, joint: `wrist${s}`, shape: box(0.04, 0.17, 0.09), pivot: "top" as const, side: s },
    { name: `thigh${s}`, joint: `hip${s}`, shape: capsule(0.075, 0.47), pivot: "top" as const, offset: [0, 0.02, 0] as [number, number, number], side: s },
    { name: `shin${s}`, joint: `knee${s}`, shape: capsule(0.06, 0.44), pivot: "top" as const, offset: [0, 0.01, 0] as [number, number, number], side: s },
    { name: `foot${s}`, joint: `ankle${s}`, shape: box(0.1, 0.07, 0.25), pivot: "top" as const, offset: [0, -0.0, 0.05] as [number, number, number], side: s },
  ]),
];

/** Mirrors a pose left↔right (swap L/R joints, negate y and z rotations). */
export function mirrorPose(pose: Pose): Pose {
  const rotations: Pose["rotations"] = {};
  for (const [name, [x, y, z]] of Object.entries(pose.rotations)) {
    const other = name.endsWith("L") ? name.slice(0, -1) + "R" : name.endsWith("R") ? name.slice(0, -1) + "L" : name;
    rotations[other] = [x, -y, -z];
  }
  return { ...pose, rotations };
}

const walkA: Pose = {
  description: "Walk contact: left leg forward, right arm forward",
  rotations: {
    spine: [3, -4, 0],
    chest: [0, -4, 0],
    hipL: [-26, 0, 0],
    kneeL: [6, 0, 0],
    ankleL: [-10, 0, 0],
    hipR: [18, 0, 0],
    kneeR: [14, 0, 0],
    ankleR: [12, 0, 0],
    shoulderL: [22, 0, 4],
    elbowL: [-12, 0, 0],
    shoulderR: [-22, 0, -4],
    elbowR: [-24, 0, 0],
  },
  rootOffset: [0, 0.017, 0],
};

const poses: Record<string, Pose> = {
  stand: {
    description: "Relaxed stand",
    rotations: { shoulderL: [0, 0, 5], shoulderR: [0, 0, -5], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0] },
  },
  rest: { description: "Rest pose (all joints zero)", rotations: {} },
  "t-pose": { description: "Arms straight out", rotations: { shoulderL: [0, 0, 90], shoulderR: [0, 0, -90] } },
  "a-pose": { description: "Arms 45° down", rotations: { shoulderL: [0, 0, 45], shoulderR: [0, 0, -45] } },
  "walk-a": walkA,
  "walk-b": { ...mirrorPose(walkA), description: "Walk contact: right leg forward, left arm forward" },
  sit: {
    description: "Seated, seat height 0.45 m, hands on thighs",
    rotations: {
      spine: [-4, 0, 0],
      hipL: [-90, 0, 4],
      hipR: [-90, 0, -4],
      kneeL: [90, 0, 0],
      kneeR: [90, 0, 0],
      shoulderL: [-28, 0, 6],
      shoulderR: [-28, 0, -6],
      elbowL: [-42, 0, 0],
      elbowR: [-42, 0, 0],
    },
    rootOffset: [0, -0.42, 0],
  },
  crouch: {
    description: "Crouch, heels down",
    rotations: {
      spine: [28, 0, 0],
      chest: [10, 0, 0],
      neck: [-20, 0, 0],
      hipL: [-100, 0, 8],
      hipR: [-100, 0, -8],
      kneeL: [128, 0, 0],
      kneeR: [128, 0, 0],
      ankleL: [-28, 0, 0],
      ankleR: [-28, 0, 0],
      shoulderL: [-40, 0, 8],
      shoulderR: [-40, 0, -8],
      elbowL: [-40, 0, 0],
      elbowR: [-40, 0, 0],
    },
    rootOffset: [0, -0.564, -0.1],
  },
  point: {
    description: "Right arm pointing straight ahead",
    rotations: {
      shoulderR: [-88, 0, 0],
      shoulderL: [0, 0, 5],
      elbowL: [-8, 0, 0],
      chest: [0, 8, 0],
      head: [0, -6, 0],
    },
  },
  reach: {
    description: "Both arms reaching forward to counter height",
    rotations: {
      spine: [12, 0, 0],
      chest: [6, 0, 0],
      shoulderL: [-55, 0, 0],
      shoulderR: [-55, 0, 0],
      elbowL: [-25, 0, 0],
      elbowR: [-25, 0, 0],
      neck: [10, 0, 0],
    },
  },
  wave: {
    description: "Right hand raised, waving",
    rotations: {
      shoulderR: [0, 0, -80],
      elbowR: [0, 0, -95],
      shoulderL: [0, 0, 5],
      elbowL: [-8, 0, 0],
      head: [0, -8, 4],
    },
  },
  "arms-crossed": {
    description: "Arms folded across the chest",
    rotations: {
      // Upper arms slightly forward, then rotated inward about their long axis (y)
      // so the bent forearms fold across the chest; one forearm sits higher.
      shoulderL: [-15, -75, 8],
      shoulderR: [-15, 75, -8],
      elbowL: [-102, 0, 0],
      elbowR: [-114, 0, 0],
    },
  },
  "look-back": {
    description: "Standing, head and chest turned over the right shoulder",
    rotations: {
      spine: [0, -15, 0],
      chest: [0, -20, 0],
      neck: [0, -15, 0],
      head: [0, -30, 0],
      shoulderL: [0, 0, 5],
      shoulderR: [0, 0, -5],
      elbowL: [-8, 0, 0],
      elbowR: [-8, 0, 0],
    },
  },
};

export const humanoid: RigDef = { name: "humanoid", height: 1.8, rootJoint: "hips", joints, parts, poses };
