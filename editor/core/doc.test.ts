import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatSceneJson } from "../../src/scene/format";
import { parseScene } from "../../src/scene/schema";
import * as D from "./doc";

const base = (): D.SceneDoc => ({
  name: "t",
  durationInFrames: 48,
  cameras: [{ id: "cam", position: [0, 1, 5] }],
  objects: [
    { id: "table", type: "primitive", shape: { kind: "box" } },
    { id: "cup", parent: "table", type: "primitive", shape: { kind: "box" } },
    { id: "bob", type: "rig", pose: "stand" },
  ],
  tracks: [{ target: "cup", property: "position", keys: [{ frame: 0, value: [0, 1, 0] }] }],
  shots: [{ id: "s1", camera: "cam", start: 0, end: 48 }],
});

const valid = (d: D.SceneDoc) => expect(() => parseScene(d)).not.toThrow();

describe("transform edits", () => {
  it("changes the base transform of static properties", () => {
    const d = D.setTransform(base(), "table", "position", [1, 0, 2.123456], 10);
    expect(d.objects![0].transform?.position).toEqual([1, 0, 2.1235]);
    expect(d.tracks!.length).toBe(1);
    valid(d);
  });
  it("auto-keys animated properties at the current frame", () => {
    const d = D.setTransform(base(), "cup", "position", [2, 1, 0], 24);
    expect(D.findTrack(d, "cup", "position")!.keys.map((k) => k.frame)).toEqual([0, 24]);
    expect(d.objects![1].transform).toBeUndefined();
    const again = D.setTransform(d, "cup", "position", [3, 1, 0], 24);
    expect(D.findTrack(again, "cup", "position")!.keys[1].value).toEqual([3, 1, 0]);
    valid(again);
  });
  it("keys all transform props and deletes keys at a frame", () => {
    let d = D.keyTransform(base(), "table", 12, { position: [1, 0, 0], rotation: [0, 90, 0], scale: [1, 1, 1] });
    d = D.keyPose(d, "bob", 12, "wave");
    expect(D.keyFrames(d, "table")).toEqual([12]);
    expect(D.keyFrames(d, "bob")).toEqual([12]);
    d = D.deleteKeysAt(d, "table", 12);
    d = D.deleteKeysAt(d, "bob", 12);
    expect(D.keyFrames(d, "table")).toEqual([]);
    expect((d.objects![2] as { poses?: unknown[] }).poses).toEqual([]);
    valid(d);
  });
});

describe("rig edits", () => {
  it("sets static joint overrides, or keys them when animated", () => {
    let d = D.setJointRotation(base(), "bob", "head", [0, 30, 0], 5);
    expect((d.objects![2] as { joints?: object }).joints).toEqual({ head: [0, 30, 0] });
    d = D.upsertKey(d, "bob", "joint:neck", 0, [0, 0, 0]);
    d = D.setJointRotation(d, "bob", "neck", [10, 0, 0], 20);
    expect(D.findTrack(d, "bob", "joint:neck")!.keys.length).toBe(2);
    valid(d);
    d = D.clearJointOverride(d, "bob", "head");
    d = D.clearJointOverride(d, "bob", "neck");
    expect((d.objects![2] as { joints?: object }).joints).toBeUndefined();
    expect(D.findTrack(d, "bob", "joint:neck")).toBeUndefined();
  });
});

describe("structure edits", () => {
  it("generates unique ids", () => {
    expect(D.uniqueId(base(), "box")).toBe("box");
    expect(D.uniqueId(base(), "table")).toBe("table-2");
    expect(D.uniqueId(base(), "cam")).toBe("cam-2");
  });
  it("deletes a subtree with its tracks", () => {
    const d = D.deleteObject(base(), "table");
    expect(d.objects!.map((o) => o.id)).toEqual(["bob"]);
    expect(d.tracks).toEqual([]);
    valid(d);
  });
  it("duplicates a subtree with tracks and remapped parents", () => {
    const { doc, newId } = D.duplicateObject(base(), "table");
    expect(newId).toBe("table-2");
    const cupCopy = doc.objects!.find((o) => o.id === "cup-2")!;
    expect(cupCopy.parent).toBe("table-2");
    expect(D.findTrack(doc, "cup-2", "position")).toBeDefined();
    expect(D.getObject(doc, "table-2")!.transform?.position).toEqual([0.5, 0, 0]);
    valid(doc);
  });
  it("renames ids and every reference", () => {
    let d = D.renameId(base(), "table", "desk");
    expect(d.objects![1].parent).toBe("desk");
    d = D.renameId(d, "cup", "mug");
    expect(d.tracks![0].target).toBe("mug");
    d = D.renameId(d, "cam", "wide");
    expect(d.shots![0].camera).toBe("wide");
    valid(d);
    expect(() => D.renameId(d, "mug", "desk")).toThrow(/already used/);
    expect(() => D.renameId(d, "mug", "bad id")).toThrow();
  });
  it("refuses parent cycles", () => {
    expect(() => D.setParent(base(), "table", "cup")).toThrow(/cannot parent/);
    valid(D.setParent(base(), "bob", "table"));
  });
});

describe("formatSceneJson", () => {
  it("round-trips the demo scene losslessly", () => {
    const src = readFileSync(join(__dirname, "../../scenes/demo.scene.json"), "utf8");
    const out = formatSceneJson(JSON.parse(src));
    expect(JSON.parse(out)).toEqual(JSON.parse(src));
    expect(out).toContain('"position": [6.5, 3.2, 7.5]');
  });
  it("never alters string contents", () => {
    const v = { notes: 'a,"b":c', list: [1, 2] };
    expect(JSON.parse(formatSceneJson(v))).toEqual(v);
  });
});
