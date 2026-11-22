import { describe, expect, it } from "vitest";
import { parseScene } from "../scene/schema";
import { isolateSubtree } from "./isolate";
import { computeStats } from "./stats";
import { fitView, VIEWS } from "./views";

const scene = (objects: unknown[]) =>
  parseScene({ name: "t", durationInFrames: 1, cameras: [{ id: "c", position: [0, 1, 5] }], objects });

const box = (id: string, position: number[], extra: object = {}) => ({
  id,
  type: "primitive",
  shape: { kind: "box", size: [1, 1, 1] },
  transform: { position },
  ...extra,
});

describe("computeStats", () => {
  it("counts geometry and measures bounds (bottom pivot sits on the floor)", () => {
    const s = computeStats(scene([box("a", [0, 0, 0])]));
    expect(s.triangles).toBe(12);
    expect(s.bounds?.min).toEqual([-0.5, 0, -0.5]);
    expect(s.bounds?.size).toEqual([1, 1, 1]);
    expect(s.issues).toEqual([]);
  });

  it("flags floating, sunken and zero-scale objects", () => {
    const s = computeStats(
      scene([
        box("float", [0, 0.5, 0]),
        box("sunk", [3, -0.2, 0]),
        { ...box("flat", [6, 0, 0]), transform: { position: [6, 0, 0], scale: [1, 0, 1] } },
      ]),
    );
    const msgs = s.issues.map((i) => `${i.objectId}:${i.message}`);
    expect(msgs.some((m) => m.startsWith("float:floating"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("sunk:extends"))).toBe(true);
    expect(s.issues.some((i) => i.objectId === "flat" && i.severity === "error")).toBe(true);
  });

  it("treats stacked objects and child parts as supported", () => {
    const s = computeStats(
      scene([
        box("table", [0, 0, 0]),
        box("cup", [0, 1, 0]),
        box("hat", [0, 1, 0], { parent: "table" }),
      ]),
    );
    expect(s.issues.filter((i) => i.message.includes("floating"))).toEqual([]);
  });

  it("reports overlap between separate objects but not parent/child", () => {
    const s = computeStats(scene([box("a", [0, 0, 0]), box("b", [0.5, 0, 0]), box("child", [0.2, 0, 0], { parent: "a" })]));
    const overlaps = s.issues.filter((i) => i.message.includes("overlap"));
    expect(overlaps.length).toBe(2); // a–b and child–b, never a–child
    expect(overlaps.every((i) => i.message.includes('"b"') || i.objectId === "b")).toBe(true);
  });
});

describe("isolateSubtree", () => {
  it("keeps the subtree's world placement", () => {
    const s = scene([
      { id: "g", type: "group", transform: { position: [2, 0, 0], rotation: [0, 90, 0] } },
      box("child", [1, 0, 0], { parent: "g" }),
      box("other", [9, 0, 0]),
    ]);
    const iso = isolateSubtree(s, "child");
    expect(iso.objects.map((o) => o.id)).toEqual(["child"]);
    const [x, y, z] = iso.objects[0].transform.position;
    expect([x, y, z].map((n) => Math.round(n * 1000) / 1000)).toEqual([2, 0, -1]);
    expect(computeStats(iso).bounds?.center).toEqual([2, 0.5, -1]);
  });
});

describe("fitView", () => {
  const bounds = { min: [-1, 0, -1], max: [1, 2, 1], size: [2, 2, 2], center: [0, 1, 0] } as const;
  it("frames ortho views with margin", () => {
    const cam = fitView(VIEWS.front, { ...bounds, min: [...bounds.min], max: [...bounds.max], size: [...bounds.size], center: [...bounds.center] }, 16 / 9, 1.1);
    expect(cam.viewHeight).toBeCloseTo(2.2);
    expect(cam.position[2]).toBeGreaterThan(1);
  });
});
