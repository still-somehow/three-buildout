import { describe, expect, it } from "vitest";
import { activeCamera, evaluateKeys, resolveScene } from "./animation";
import { parseScene, type Keyframe } from "./schema";

const k = (frame: number, value: Keyframe["value"], ease: Keyframe["ease"] = "linear"): Keyframe => ({ frame, value, ease });

describe("evaluateKeys", () => {
  it("holds before the first and after the last key", () => {
    const keys = [k(10, 1), k(20, 3)];
    expect(evaluateKeys(keys, 0)).toBe(1);
    expect(evaluateKeys(keys, 99)).toBe(3);
  });
  it("interpolates linearly", () => {
    expect(evaluateKeys([k(0, 0), k(10, 10)], 5)).toBe(5);
    expect(evaluateKeys([k(0, [0, 0, 0]), k(10, [10, 20, -10])], 5)).toEqual([5, 10, -5]);
  });
  it("uses the outgoing key's ease", () => {
    expect(evaluateKeys([k(0, 0, "step"), k(10, 10)], 9)).toBe(0);
    const eased = evaluateKeys([k(0, 0, "easeInOut"), k(10, 10)], 2) as number;
    expect(eased).toBeLessThan(2);
    expect(evaluateKeys([k(0, 0, "easeInOut"), k(10, 10)], 5)).toBeCloseTo(5);
  });
  it("finds the right segment among several keys", () => {
    expect(evaluateKeys([k(0, 0), k(10, 10), k(20, 0)], 15)).toBe(5);
  });
});

const base = {
  name: "t",
  durationInFrames: 20,
  cameras: [
    { id: "a", position: [0, 1, 5] },
    { id: "b", position: [5, 1, 0] },
  ],
  objects: [{ id: "box", type: "primitive", shape: { kind: "box" } }],
};

describe("resolveScene", () => {
  it("applies object and camera tracks without mutating the input", () => {
    const scene = parseScene({
      ...base,
      tracks: [
        { target: "box", property: "position", keys: [k(0, [0, 0, 0]), k(10, [10, 0, 0])] },
        { target: "a", property: "fov", keys: [k(0, 20), k(10, 40)] },
      ],
    });
    const r = resolveScene(scene, 5);
    expect(r.objects[0].transform.position).toEqual([5, 0, 0]);
    expect(r.cameras[0].fov).toBe(30);
    expect(scene.objects[0].transform.position).toEqual([0, 0, 0]);
  });
});

describe("activeCamera", () => {
  it("cuts between shot cameras and falls back to the first camera", () => {
    const scene = parseScene({
      ...base,
      shots: [
        { id: "s1", camera: "a", start: 0, end: 10 },
        { id: "s2", camera: "b", start: 10, end: 15 },
      ],
    });
    expect(activeCamera(scene, 3).id).toBe("a");
    expect(activeCamera(scene, 10).id).toBe("b");
    expect(activeCamera(scene, 18).id).toBe("a");
    expect(activeCamera(scene, 3, "b").id).toBe("b");
  });
});

describe("schema validation", () => {
  const bad = (patch: object) => () => parseScene({ ...base, ...patch });
  it("fills defaults", () => {
    const s = parseScene(base);
    expect(s.fps).toBe(24);
    expect(s.lights.length).toBe(2);
    expect(s.objects[0].transform.scale).toEqual([1, 1, 1]);
  });
  it("rejects bad references and orderings", () => {
    expect(bad({ objects: [{ id: "x", type: "group", parent: "nope" }] })).toThrow(/unknown parent/);
    expect(
      bad({ objects: [{ id: "x", type: "group", parent: "y" }, { id: "y", type: "group", parent: "x" }] }),
    ).toThrow(/cycle/);
    expect(bad({ shots: [{ id: "s", camera: "zzz", start: 0, end: 5 }] })).toThrow(/unknown camera/);
    expect(bad({ shots: [{ id: "s", camera: "a", start: 0, end: 50 }] })).toThrow(/exceeds/);
    expect(
      bad({ tracks: [{ target: "box", property: "position", keys: [k(5, [0, 0, 0]), k(5, [1, 1, 1])] }] }),
    ).toThrow(/strictly increasing/);
    expect(bad({ tracks: [{ target: "box", property: "fov", keys: [k(0, 1)] }] })).toThrow(/cannot animate/);
  });
});
