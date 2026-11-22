import { useState } from "react";
import type { Shape } from "../src/scene/schema";
import * as D from "./core/doc";
import { useEditor } from "./store";

const ICON: Record<string, string> = { primitive: "◼", group: "▣", rig: "♙", camera: "🎥" };

const NEW_SHAPES: { label: string; id: string; shape: Partial<Shape> & { kind: Shape["kind"] } }[] = [
  { label: "Box", id: "box", shape: { kind: "box", size: [1, 1, 1] } },
  { label: "Cylinder", id: "cylinder", shape: { kind: "cylinder", radiusTop: 0.5, radiusBottom: 0.5, height: 1, segments: 8 } },
  { label: "Sphere", id: "sphere", shape: { kind: "sphere", radius: 0.5, segments: 8 } },
  { label: "Cone", id: "cone", shape: { kind: "cone", radius: 0.5, height: 1, segments: 8 } },
  { label: "Capsule", id: "capsule", shape: { kind: "capsule", radius: 0.25, height: 1, segments: 8 } },
  { label: "Wedge", id: "wedge", shape: { kind: "wedge", size: [1, 1, 1] } },
  { label: "Plane", id: "plane", shape: { kind: "plane", size: [4, 4] } },
];

export const Outliner: React.FC = () => {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const edit = useEditor((s) => s.edit);
  const set = useEditor((s) => s.set);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (!doc) return null;

  const objs = D.objects(doc);
  const children = (parent?: string) => objs.filter((o) => o.parent === parent);
  const isSel = (id: string) => (selection?.kind === "object" && selection.id === id) || (selection?.kind === "joint" && selection.rigId === id);

  const add = (obj: D.DocObject) => {
    // Place new things under the selected group, if a group is selected.
    const sel = selection?.kind === "object" ? D.getObject(doc, selection.id) : undefined;
    const parent = sel?.type === "group" ? sel.id : undefined;
    let newId = "";
    edit((d) => {
      const next = D.addObject(d, { ...obj, parent });
      newId = D.objects(next)[D.objects(next).length - 1].id;
      return next;
    }, `Added ${obj.id}`);
    if (newId) set({ selection: { kind: "object", id: newId } });
  };

  const tree = (parent: string | undefined, depth: number): React.ReactNode =>
    children(parent).map((o) => {
      const kids = children(o.id);
      return (
        <div key={o.id}>
          <div
            className={`tree-row ${isSel(o.id) ? "selected" : ""} ${o.visible === false ? "hidden" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => set({ selection: { kind: "object", id: o.id } })}
          >
            <span
              className="twisty"
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed({ ...collapsed, [o.id]: !collapsed[o.id] });
              }}
            >
              {kids.length ? (collapsed[o.id] ? "▸" : "▾") : ""}
            </span>
            <span className="icon">{ICON[o.type]}</span>
            <span className="tree-label">{o.id}</span>
            {o.name && <span className="tree-sub">{o.name}</span>}
            <span
              className="eye"
              title="Show/hide"
              onClick={(e) => {
                e.stopPropagation();
                edit((d) => D.patchObject(d, o.id, { visible: o.visible === false ? undefined : false }), "Toggled visibility");
              }}
            >
              {o.visible === false ? "◌" : "●"}
            </span>
          </div>
          {!collapsed[o.id] && tree(o.id, depth + 1)}
        </div>
      );
    });

  return (
    <div className="panel outliner">
      <div className={`tree-row scene-row ${selection === null ? "selected" : ""}`} onClick={() => set({ selection: null })}>
        <span className="icon">🎬</span>
        <span className="tree-label">{doc.name}</span>
      </div>
      <div className="tree">{tree(undefined, 0)}</div>
      <div className="tree-heading">Cameras</div>
      {doc.cameras.map((c) => (
        <div
          key={c.id}
          className={`tree-row ${selection?.kind === "camera" && selection.id === c.id ? "selected" : ""}`}
          style={{ paddingLeft: 8 }}
          onClick={() => set({ selection: { kind: "camera", id: c.id } })}
        >
          <span className="twisty" />
          <span className="icon">{ICON.camera}</span>
          <span className="tree-label">{c.id}</span>
          {c.name && <span className="tree-sub">{c.name}</span>}
        </div>
      ))}
      <div className="tree-heading">Add</div>
      <div className="add-grid">
        {NEW_SHAPES.map((s) => (
          <button key={s.id} onClick={() => add({ id: s.id, type: "primitive", shape: s.shape as Shape, color: "grey" })}>
            {s.label}
          </button>
        ))}
        <button onClick={() => add({ id: "group", type: "group" })}>Group</button>
        <button onClick={() => add({ id: "actor", type: "rig", rig: "humanoid", pose: "stand", color: "blue" })}>Mannequin</button>
        <button
          onClick={() => {
            const id = D.uniqueId(doc, "cam");
            edit((d) => ({ ...d, cameras: [...d.cameras, { id, position: [4, 1.6, 4], target: [0, 1, 0], fov: 40 }] }), "Added camera");
            set({ selection: { kind: "camera", id } });
          }}
        >
          Camera
        </button>
      </div>
    </div>
  );
};
