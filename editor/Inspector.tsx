import { PALETTE } from "../src/scene/primitives";
import type { Scene, Vec3 } from "../src/scene/schema";
import { RIGS } from "../src/rig/registry";
import * as D from "./core/doc";
import { orbitView, useResolved } from "./hooks";
import { useEditor } from "./store";
import { NumberField, Row, Section, TextField, Vec3Field } from "./ui";

const round3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000) as Vec3;

export const Inspector: React.FC = () => {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  if (!doc) return null;
  return (
    <div className="panel inspector">
      {selection === null && <SceneInspector />}
      {selection?.kind === "object" && D.getObject(doc, selection.id) && <ObjectInspector id={selection.id} />}
      {selection?.kind === "joint" && <JointInspector rigId={selection.rigId} joint={selection.joint} />}
      {selection?.kind === "camera" && D.getCamera(doc, selection.id) && <CameraInspector id={selection.id} />}
    </div>
  );
};

/** ◆ when the property is animated; filled when there's a key on this frame. */
const KeyMark: React.FC<{ target: string; property: string }> = ({ target, property }) => {
  const doc = useEditor((s) => s.doc)!;
  const frame = useEditor((s) => s.frame);
  const track = D.findTrack(doc, target, property);
  if (!track) return <span className="keymark" title="Static (not animated)" />;
  const onKey = track.keys.some((k) => k.frame === frame);
  return (
    <span className={`keymark animated ${onKey ? "on" : ""}`} title={onKey ? "Key on this frame" : "Animated: editing adds a key at this frame"}>
      {onKey ? "◆" : "◇"}
    </span>
  );
};

const IdRow: React.FC<{ id: string; kind: "object" | "camera" }> = ({ id, kind }) => {
  const edit = useEditor((s) => s.edit);
  const set = useEditor((s) => s.set);
  return (
    <Row label="id" hint="Renaming updates parents, tracks and shots">
      <TextField
        mono
        value={id}
        onCommit={(to) => {
          edit((d) => D.renameId(d, id, to), `Renamed ${id} → ${to}`);
          const s = useEditor.getState();
          if (s.doc && (D.getObject(s.doc, to) || D.getCamera(s.doc, to))) set({ selection: { kind, id: to } });
        }}
      />
    </Row>
  );
};

const ColorRow: React.FC<{ id: string; color: string | undefined }> = ({ id, color = "grey" }) => {
  const edit = useEditor((s) => s.edit);
  const commit = (c: string) => edit((d) => D.patchObject(d, id, { color: c }), "Colour");
  return (
    <Row label="colour">
      <select value={PALETTE[color] ? color : ""} onChange={(e) => e.target.value && commit(e.target.value)}>
        {!PALETTE[color] && <option value="">custom</option>}
        {Object.keys(PALETTE).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input type="color" value={PALETTE[color] ?? (color.startsWith("#") ? color : "#9c9c9c")} onChange={(e) => commit(e.target.value)} />
    </Row>
  );
};

const ObjectInspector: React.FC<{ id: string }> = ({ id }) => {
  const doc = useEditor((s) => s.doc)!;
  const parsed = useEditor((s) => s.parsed);
  const frame = useEditor((s) => s.frame);
  const edit = useEditor((s) => s.edit);
  const resolved = useResolved();
  const o = D.getObject(doc, id)!;
  const p = parsed?.objects.find((x) => x.id === id);
  const r = resolved?.objects.find((x) => x.id === id);
  const def = o.type === "rig" ? RIGS[o.rig ?? "humanoid"] : undefined;
  const k = def && o.type === "rig" ? (o.height ?? def.height) / def.height : 1;
  const evaluated = (prop: D.TransformProp): Vec3 => {
    const v = (r?.transform[prop] as Vec3) ?? D.baseTransform(o, prop);
    return prop === "scale" ? (v.map((n) => n / k) as Vec3) : v;
  };
  const sub = D.subtree(doc, id);
  const parentOptions = D.objects(doc).filter((x) => !sub.has(x.id));

  return (
    <>
      <Section title={`${o.type === "rig" ? "Mannequin" : o.type === "group" ? "Group" : "Primitive"} · ${o.id}`}>
        <IdRow id={o.id} kind="object" />
        <Row label="name">
          <TextField value={o.name ?? ""} placeholder="(optional)" onCommit={(v) => edit((d) => D.patchObject(d, id, { name: v || undefined }), "Name")} />
        </Row>
        <Row label="parent">
          <select value={o.parent ?? ""} onChange={(e) => edit((d) => D.setParent(d, id, e.target.value || undefined), "Reparented")}>
            <option value="">(none)</option>
            {parentOptions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}
              </option>
            ))}
          </select>
        </Row>
        <Row label="notes">
          <TextField value={o.notes ?? ""} placeholder="(optional)" onCommit={(v) => edit((d) => D.patchObject(d, id, { notes: v || undefined }), "Notes")} />
        </Row>
      </Section>

      <Section title="Transform" right={<span className="hint">frame {frame}</span>}>
        {(["position", "rotation", "scale"] as const).map((prop) => (
          <Row key={prop} label={prop === "rotation" ? "rotation°" : prop}>
            <KeyMark target={id} property={prop} />
            <Vec3Field
              value={evaluated(prop)}
              step={prop === "rotation" ? 5 : 0.05}
              onCommit={(v) => edit((d) => D.setTransform(d, id, prop, v, frame), `${prop} ${id}`)}
            />
          </Row>
        ))}
      </Section>

      {o.type === "primitive" && p?.type === "primitive" && (
        <Section title={`Shape · ${p.shape.kind}`}>
          {Object.entries(p.shape)
            .filter(([key]) => key !== "kind")
            .map(([key, value]) => (
              <Row key={key} label={key}>
                {Array.isArray(value) ? (
                  <span className="vec3">
                    {value.map((n, i) => (
                      <NumberField
                        key={i}
                        value={n}
                        step={0.05}
                        min={0.001}
                        onCommit={(nv) =>
                          edit((d) => D.patchObject(d, id, { shape: { ...o.shape, [key]: value.map((x, j) => (j === i ? nv : x)) } }), `Shape ${key}`)
                        }
                      />
                    ))}
                  </span>
                ) : (
                  <NumberField
                    value={value as number}
                    step={key === "segments" ? 1 : 0.05}
                    min={key === "segments" ? 3 : 0.001}
                    onCommit={(nv) => edit((d) => D.patchObject(d, id, { shape: { ...o.shape, [key]: key === "segments" ? Math.round(nv) : nv } }), `Shape ${key}`)}
                  />
                )}
              </Row>
            ))}
          <Row label="pivot" hint="Where the object's origin sits">
            <select value={o.pivot ?? "bottom"} onChange={(e) => edit((d) => D.patchObject(d, id, { pivot: e.target.value }), "Pivot")}>
              <option value="bottom">bottom</option>
              <option value="center">center</option>
              <option value="top">top</option>
            </select>
          </Row>
          <ColorRow id={id} color={o.color} />
        </Section>
      )}

      {o.type === "rig" && def && <RigSection id={id} />}
    </>
  );
};

const RigSection: React.FC<{ id: string }> = ({ id }) => {
  const doc = useEditor((s) => s.doc)!;
  const frame = useEditor((s) => s.frame);
  const edit = useEditor((s) => s.edit);
  const set = useEditor((s) => s.set);
  const o = D.getObject(doc, id) as Extract<D.DocObject, { type: "rig" }>;
  const def = RIGS[o.rig ?? "humanoid"];
  const poseNames = Object.keys(def.poses);
  const keys = o.poses ?? [];
  const overrides = Object.entries(o.joints ?? {});
  const keyAtFrame = keys.find((kk) => kk.frame === frame);

  return (
    <>
      <Section title={`Rig · ${def.name}`}>
        <ColorRow id={id} color={o.color} />
        <Row label="height m">
          <NumberField value={o.height ?? def.height} step={0.05} min={0.1} onCommit={(v) => edit((d) => D.patchObject(d, id, { height: v === def.height ? undefined : v }), "Height")} />
        </Row>
        {keys.length === 0 && (
          <Row label="pose">
            <select value={o.pose ?? "stand"} onChange={(e) => edit((d) => D.patchObject(d, id, { pose: e.target.value }), "Pose")}>
              {poseNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Row>
        )}
        <Row label="joint">
          <select value="" onChange={(e) => e.target.value && set({ selection: { kind: "joint", rigId: id, joint: e.target.value } })}>
            <option value="">select a joint…</option>
            {def.joints.map((j) => (
              <option key={j.name}>{j.name}</option>
            ))}
          </select>
        </Row>
        <div className="hint">Tip: click the mannequin again in the viewport to pick a joint.</div>
      </Section>

      <Section title="Pose keys" right={<span className="hint">{keys.length ? "animated" : "static pose"}</span>}>
        {keys.map((kk) => (
          <div key={kk.frame} className={`list-row ${kk.frame === frame ? "current" : ""}`}>
            <button className="link" onClick={() => useEditor.getState().setFrame(kk.frame)}>
              f{kk.frame}
            </button>
            <select value={kk.pose} onChange={(e) => edit((d) => D.keyPose(d, id, kk.frame, e.target.value), "Pose key")}>
              {poseNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <button className="icon-btn" title="Delete key" onClick={() => edit((d) => D.patchObject(d, id, { poses: keys.filter((x) => x.frame !== kk.frame) }), "Deleted pose key")}>
              ✕
            </button>
          </div>
        ))}
        <div className="list-row">
          <span className="hint">{keyAtFrame ? `f${frame}: change above` : `key at f${frame}:`}</span>
          {!keyAtFrame && (
            <select value="" onChange={(e) => e.target.value && edit((d) => D.keyPose(d, id, frame, e.target.value), `Pose key f${frame}`)}>
              <option value="">add pose…</option>
              {poseNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
        </div>
      </Section>

      {overrides.length > 0 && (
        <Section title="Joint overrides">
          {overrides.map(([joint, v]) => (
            <div key={joint} className="list-row">
              <button className="link" onClick={() => set({ selection: { kind: "joint", rigId: id, joint } })}>
                {joint}
              </button>
              <span className="mono dim">[{(v as number[]).join(", ")}]</span>
              <button className="icon-btn" title="Reset to pose" onClick={() => edit((d) => D.clearJointOverride(d, id, joint), `Reset ${joint}`)}>
                ✕
              </button>
            </div>
          ))}
        </Section>
      )}
    </>
  );
};

const JointInspector: React.FC<{ rigId: string; joint: string }> = ({ rigId, joint }) => {
  const doc = useEditor((s) => s.doc)!;
  const frame = useEditor((s) => s.frame);
  const edit = useEditor((s) => s.edit);
  const set = useEditor((s) => s.set);
  const resolved = useResolved();
  const o = D.getObject(doc, rigId);
  if (o?.type !== "rig") return null;
  const def = RIGS[o.rig ?? "humanoid"];
  const jdef = def.joints.find((j) => j.name === joint);
  const r = resolved?.objects.find((x) => x.id === `${rigId}/${joint}`);
  const rotation = (r?.transform.rotation as Vec3) ?? [0, 0, 0];
  const overridden = !!o.joints?.[joint] || !!D.findTrack(doc, rigId, `joint:${joint}`);
  const kids = def.joints.filter((j) => j.parent === joint);

  return (
    <>
      <Section title={`Joint · ${rigId} / ${joint}`}>
        <Row label="rotation°">
          <KeyMark target={rigId} property={`joint:${joint}`} />
          <Vec3Field value={rotation} step={5} onCommit={(v) => edit((d) => D.setJointRotation(d, rigId, joint, v, frame), `Posed ${joint}`)} />
        </Row>
        <div className="list-row">
          <button onClick={() => edit((d) => D.upsertKey(d, rigId, `joint:${joint}`, frame, rotation), `Keyed ${joint}`)}>◆ Key joint at f{frame}</button>
          {overridden && <button onClick={() => edit((d) => D.clearJointOverride(d, rigId, joint), `Reset ${joint}`)}>Reset to pose</button>}
        </div>
        <div className="hint">Rotate with the gizmo (local axes) or type degrees. See the README cheat-sheet for which axis does what.</div>
      </Section>
      <Section title="Navigate">
        <div className="chips">
          <button onClick={() => set({ selection: { kind: "object", id: rigId } })}>↑ rig</button>
          {jdef?.parent && <button onClick={() => set({ selection: { kind: "joint", rigId, joint: jdef.parent! } })}>↑ {jdef.parent}</button>}
          {kids.map((kj) => (
            <button key={kj.name} onClick={() => set({ selection: { kind: "joint", rigId, joint: kj.name } })}>
              ↓ {kj.name}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
};

const CameraInspector: React.FC<{ id: string }> = ({ id }) => {
  const doc = useEditor((s) => s.doc)!;
  const frame = useEditor((s) => s.frame);
  const viewCamera = useEditor((s) => s.viewCamera);
  const edit = useEditor((s) => s.edit);
  const set = useEditor((s) => s.set);
  const resolved = useResolved();
  const c = D.getCamera(doc, id)!;
  const rc = resolved?.cameras.find((x) => x.id === id);

  return (
    <Section title={`Camera · ${id}`}>
      <IdRow id={id} kind="camera" />
      <Row label="name">
        <TextField value={c.name ?? ""} placeholder="(optional)" onCommit={(v) => edit((d) => D.patchCamera(d, id, { name: v || undefined }), "Name")} />
      </Row>
      {(["position", "target"] as const).map((prop) => (
        <Row key={prop} label={prop}>
          <KeyMark target={id} property={prop} />
          <Vec3Field value={(rc?.[prop] as Vec3) ?? (c[prop] as Vec3)} step={0.05} onCommit={(v) => edit((d) => D.setCameraProp(d, id, prop, v, frame), `Camera ${prop}`)} />
        </Row>
      ))}
      <Row label="fov°">
        <KeyMark target={id} property="fov" />
        <NumberField value={rc?.fov ?? c.fov ?? 40} step={1} min={1} onCommit={(v) => edit((d) => D.setCameraProp(d, id, "fov", v, frame), "Camera fov")} />
      </Row>
      <div className="list-row">
        <button className={viewCamera === id ? "active" : ""} onClick={() => set({ viewCamera: viewCamera === id ? null : id })}>
          {viewCamera === id ? "Exit camera view" : "👁 Look through"}
        </button>
        <button
          title="Copy the free orbit view into this camera"
          disabled={viewCamera === id}
          onClick={() =>
            edit((d) => {
              let n = D.setCameraProp(d, id, "position", round3(orbitView.position), frame);
              n = D.setCameraProp(n, id, "target", round3(orbitView.target), frame);
              return D.setCameraProp(n, id, "fov", orbitView.fov, frame);
            }, `Camera ${id} set from view`)
          }
        >
          Set from current view
        </button>
      </div>
      <div className="list-row">
        <button
          onClick={() =>
            edit((d) => {
              let n = D.upsertKey(d, id, "position", frame, (rc?.position ?? c.position) as Vec3);
              n = D.upsertKey(n, id, "target", frame, (rc?.target ?? c.target ?? [0, 1, 0]) as Vec3);
              return D.upsertKey(n, id, "fov", frame, rc?.fov ?? c.fov ?? 40);
            }, `Keyed camera ${id}`)
          }
        >
          ◆ Key camera at f{frame}
        </button>
        <button
          disabled={doc.cameras.length < 2 || (doc.shots ?? []).some((s) => s.camera === id)}
          title={(doc.shots ?? []).some((s) => s.camera === id) ? "Used by a shot" : "Delete camera"}
          onClick={() => {
            edit((d) => ({ ...d, cameras: d.cameras.filter((x) => x.id !== id), tracks: (d.tracks ?? []).filter((t) => t.target !== id) }), `Deleted ${id}`);
            set({ selection: null, viewCamera: viewCamera === id ? null : viewCamera });
          }}
        >
          Delete
        </button>
      </div>
    </Section>
  );
};

const SceneInspector: React.FC = () => {
  const doc = useEditor((s) => s.doc)!;
  const parsed = useEditor((s) => s.parsed);
  const frame = useEditor((s) => s.frame);
  const edit = useEditor((s) => s.edit);
  const settings = (parsed?.settings ?? {}) as Partial<Scene["settings"]>;
  const shots = doc.shots ?? [];
  const patchShot = (i: number, patch: Record<string, unknown>) =>
    edit((d) => ({ ...d, shots: (d.shots ?? []).map((s, j) => (j === i ? { ...s, ...patch } : s)) }), "Shot");

  return (
    <>
      <Section title="Scene">
        <Row label="name">
          <TextField value={doc.name} onCommit={(v) => edit((d) => D.patchScene(d, { name: v }), "Scene name")} />
        </Row>
        <Row label="fps">
          <NumberField value={doc.fps ?? 24} step={1} min={1} onCommit={(v) => edit((d) => D.patchScene(d, { fps: Math.round(v) }), "fps")} />
        </Row>
        <Row label="frames">
          <NumberField value={doc.durationInFrames} step={1} min={1} onCommit={(v) => edit((d) => D.patchScene(d, { durationInFrames: Math.round(v) }), "Duration")} />
        </Row>
        <Row label="size px">
          <NumberField value={doc.width ?? 1280} step={16} min={16} width={70} onCommit={(v) => edit((d) => D.patchScene(d, { width: Math.round(v) }), "Width")} />
          ×
          <NumberField value={doc.height ?? 720} step={16} min={16} width={70} onCommit={(v) => edit((d) => D.patchScene(d, { height: Math.round(v) }), "Height")} />
        </Row>
      </Section>
      <Section title="Settings">
        {(["grid", "edges", "shadows"] as const).map((key) => (
          <Row key={key} label={key}>
            <input
              type="checkbox"
              checked={!!settings[key]}
              onChange={(e) => edit((d) => ({ ...d, settings: { ...(d.settings ?? {}), [key]: e.target.checked } }), key)}
            />
          </Row>
        ))}
        <Row label="background">
          <input
            type="color"
            value={settings.background ?? "#2b2d31"}
            onChange={(e) => edit((d) => ({ ...d, settings: { ...(d.settings ?? {}), background: e.target.value } }), "Background")}
          />
        </Row>
      </Section>
      <Section
        title="Shots"
        right={
          <button
            onClick={() =>
              edit((d) => {
                const last = (d.shots ?? []).at(-1);
                const start = last ? last.end : 0;
                const end = Math.min(d.durationInFrames, Math.max(start + 1, frame + 1, start + 24));
                const id = `sh${String(((d.shots ?? []).length + 1) * 10).padStart(3, "0")}`;
                return { ...d, shots: [...(d.shots ?? []), { id, camera: d.cameras[0].id, start: Math.min(start, end - 1), end }] };
              }, "Added shot")
            }
          >
            + shot
          </button>
        }
      >
        {shots.map((s, i) => (
          <div key={i} className="shot-card">
            <div className="list-row">
              <span className="mono">{s.id}</span>
              <TextField value={s.name ?? ""} placeholder="shot name" onCommit={(v) => patchShot(i, { name: v || undefined })} />
              <button className="icon-btn" title="Delete shot" onClick={() => edit((d) => ({ ...d, shots: (d.shots ?? []).filter((_, j) => j !== i) }), "Deleted shot")}>
                ✕
              </button>
            </div>
            <div className="list-row">
              <select value={s.camera} onChange={(e) => patchShot(i, { camera: e.target.value })}>
                {doc.cameras.map((c) => (
                  <option key={c.id}>{c.id}</option>
                ))}
              </select>
              f<NumberField value={s.start} step={1} min={0} width={52} onCommit={(v) => patchShot(i, { start: Math.round(v) })} />→
              <NumberField value={s.end} step={1} min={1} width={52} onCommit={(v) => patchShot(i, { end: Math.round(v) })} />
            </div>
            <TextField value={s.notes ?? ""} placeholder="notes" onCommit={(v) => patchShot(i, { notes: v || undefined })} />
          </div>
        ))}
      </Section>
    </>
  );
};
