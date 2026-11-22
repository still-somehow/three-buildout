import { describe, expect, it } from "vitest";
import { resolveScene } from "../scene/animation";
import { parseScene } from "../scene/schema";
import { computeStats } from "../qa/stats";
import { mirrorPose } from "./humanoid";
import { RIGS } from "./registry";

const sceneWith = (rig: object, extra: object = {}) =>
  parseScene({
    name: "t",
    durationInFrames: 48,
    cameras: [{ id: "c", position: [0, 1, 5] }],
    objects: [{ id: "m", type: "rig", ...rig }],
    ...extra,
  });

const statsAt = (rig: object, frame = 0, extra: object = {}) => computeStats(resolveScene(sceneWith(rig, extra), frame));

describe("humanoid", () => {
  const def = RIGS.humanoid;

  it("stands exactly 1.8 m tall with feet on the floor", () => {
    const b = statsAt({ pose: "rest" }).bounds!;
    expect(b.min[1]).toBeCloseTo(0, 3);
    expect(b.max[1]).toBeCloseTo(1.8, 3);
  });

  it.each(Object.keys(RIGS.humanoid.poses))("pose %s is grounded and has no issues", (pose) => {
    const s = statsAt({ pose });
    expect(s.issues).toEqual([]);
    expect(s.bounds!.min[1]).toBeGreaterThanOrEqual(-0.02);
  });

  it("expands to path-style ids with no collisions", () => {
    const objs = resolveScene(sceneWith({ pose: "stand" }), 0).objects;
    const ids = objs.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("m/head");
    expect(ids).toContain("m/head/nose");
    expect(objs.length).toBe(1 + def.joints.length + def.parts.length);
    expect(objs.some((o) => o.type === "rig")).toBe(false);
  });

  it("scales to a requested height", () => {
    expect(statsAt({ pose: "rest", height: 1.2 }).bounds!.max[1]).toBeCloseTo(1.2, 3);
  });

  it("blends pose keys over time and applies joint tracks on top", () => {
    const rig = { poses: [{ frame: 0, pose: "rest" }, { frame: 20, pose: "t-pose", ease: "linear" }] };
    const width = (f: number) => statsAt(rig, f).bounds!.size[0];
    expect(width(0)).toBeLessThan(width(10));
    expect(width(10)).toBeLessThan(width(20));

    const tracked = resolveScene(
      sceneWith({ pose: "rest" }, { tracks: [{ target: "m", property: "joint:head", keys: [{ frame: 0, value: [0, 0, 0] }, { frame: 10, value: [0, 90, 0] }] }] }),
      5,
    );
    expect(tracked.objects.find((o) => o.id === "m/head")!.transform.rotation[1]).toBeCloseTo(45);
  });

  it("mirrors poses left/right", () => {
    const m = mirrorPose({ rotations: { shoulderL: [10, 20, 30], spine: [5, 6, 7] } });
    expect(m.rotations).toEqual({ shoulderR: [10, -20, -30], spine: [5, -6, -7] });
  });

  it("rejects unknown rigs, poses and joints", () => {
    expect(() => sceneWith({ rig: "dragon" })).toThrow(/unknown rig/);
    expect(() => sceneWith({ pose: "moonwalk" })).toThrow(/unknown pose "moonwalk"/);
    expect(() => sceneWith({ joints: { tail: [0, 0, 0] } })).toThrow(/unknown joint "tail"/);
    expect(() => sceneWith({ pose: "stand" }, { tracks: [{ target: "m", property: "joint:wing", keys: [{ frame: 0, value: [0, 0, 0] }] }] })).toThrow(/unknown joint "wing"/);
  });
});
