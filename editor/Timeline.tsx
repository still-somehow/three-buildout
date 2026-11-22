import { useEffect, useRef } from "react";
import { resolveScene } from "../src/scene/animation";
import type { Vec3 } from "../src/scene/schema";
import * as D from "./core/doc";
import { useEditor, type Selection } from "./store";

const SHOT_COLORS = ["#4a6fa5", "#7a5aa5", "#4f9a8a", "#a5774a", "#a54a6a", "#6a8f3f"];

/** The doc target whose keys the timeline shows for a selection. */
function keyTarget(sel: Selection): string | null {
  if (!sel) return null;
  return sel.kind === "joint" ? sel.rigId : sel.id;
}

/** Keys everything that can be keyed for the current selection at the current frame. */
export function keySelection() {
  const { selection, frame, edit, doc, parsed } = useEditor.getState();
  if (!selection || !doc || !parsed) return;
  const r = resolveScene(parsed, frame);
  if (selection.kind === "object") {
    const o = r.objects.find((x) => x.id === selection.id);
    const docObj = D.getObject(doc, selection.id);
    if (!o || !docObj) return;
    const base = (p: D.TransformProp) => (o.transform[p] as Vec3);
    // Rig roots carry their height factor in the evaluated scale; key the doc's own scale.
    const scale = docObj.type === "rig" ? D.baseTransform(docObj, "scale") : base("scale");
    edit((d) => D.keyTransform(d, selection.id, frame, { position: base("position"), rotation: base("rotation"), scale }), `Keyed ${selection.id} at f${frame}`);
  } else if (selection.kind === "joint") {
    const j = r.objects.find((x) => x.id === `${selection.rigId}/${selection.joint}`);
    if (j) edit((d) => D.upsertKey(d, selection.rigId, `joint:${selection.joint}`, frame, j.transform.rotation as Vec3), `Keyed ${selection.joint} at f${frame}`);
  } else {
    const c = r.cameras.find((x) => x.id === selection.id);
    if (!c) return;
    edit((d) => {
      let n = D.upsertKey(d, c.id, "position", frame, c.position);
      n = D.upsertKey(n, c.id, "target", frame, c.target);
      return D.upsertKey(n, c.id, "fov", frame, c.fov);
    }, `Keyed camera ${c.id} at f${frame}`);
  }
}

export const Timeline: React.FC = () => {
  const doc = useEditor((s) => s.doc);
  const parsed = useEditor((s) => s.parsed);
  const frame = useEditor((s) => s.frame);
  const playing = useEditor((s) => s.playing);
  const selection = useEditor((s) => s.selection);
  const set = useEditor((s) => s.set);
  const setFrame = useEditor((s) => s.setFrame);
  const edit = useEditor((s) => s.edit);
  usePlayback();

  if (!doc || !parsed) return null;
  const duration = parsed.durationInFrames;
  const target = keyTarget(selection);
  const keys = target ? D.keyFrames(doc, target) : [];
  const pct = (f: number) => `${(f / Math.max(1, duration - 1)) * 100}%`;
  const prevKey = [...keys].reverse().find((k) => k < frame);
  const nextKey = keys.find((k) => k > frame);
  const shot = parsed.shots.find((s) => frame >= s.start && frame < s.end);
  const seconds = (frame / parsed.fps).toFixed(2);

  return (
    <div className="timeline">
      <div className="transport">
        <button onClick={() => setFrame(0)} title="Start (Home)">⏮</button>
        <button onClick={() => prevKey !== undefined && setFrame(prevKey)} disabled={prevKey === undefined} title="Previous key">
          ◀◆
        </button>
        <button className="play" onClick={() => set({ playing: !playing })} title="Play/pause (Space)">
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={() => nextKey !== undefined && setFrame(nextKey)} disabled={nextKey === undefined} title="Next key">
          ◆▶
        </button>
        <span className="frame-readout mono">
          f{String(frame).padStart(3, "0")} / {duration - 1} · {seconds}s{shot ? ` · ${shot.id}${shot.name ? ` “${shot.name}”` : ""}` : ""}
        </span>
        <span className="spacer" />
        {target && (
          <>
            <button onClick={keySelection} title="Key the selection at this frame (K)">◆ Key</button>
            <button
              disabled={!keys.includes(frame)}
              onClick={() => edit((d) => D.deleteKeysAt(d, target, frame), `Deleted keys at f${frame}`)}
              title="Delete the selection's keys at this frame"
            >
              ✕ Key
            </button>
          </>
        )}
      </div>
      <div className="track-area">
        <div className="shots-lane">
          {parsed.shots.map((s, i) => (
            <div
              key={s.id}
              className="shot-bar"
              style={{ left: pct(s.start), width: `calc(${pct(s.end - 1)} - ${pct(s.start)})`, background: SHOT_COLORS[i % SHOT_COLORS.length] }}
              title={`${s.id} · ${s.camera} · f${s.start}–${s.end - 1}${s.notes ? `\n${s.notes}` : ""}`}
              onClick={() => setFrame(s.start)}
            >
              {s.id} · {s.camera}
            </div>
          ))}
        </div>
        <div className="keys-lane">
          {keys.map((k) => (
            <span key={k} className={`key-tick ${k === frame ? "on" : ""}`} style={{ left: pct(k) }} onClick={() => setFrame(k)} title={`Key at f${k}`}>
              ◆
            </span>
          ))}
          {!target && <span className="hint lane-hint">Select an object to see its keys</span>}
        </div>
        <input className="scrubber" type="range" min={0} max={duration - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} />
      </div>
    </div>
  );
};

/** Advances the frame in real time while playing (loops). */
function usePlayback() {
  const playing = useEditor((s) => s.playing);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const { parsed } = useEditor.getState();
    if (!parsed) return;
    const startFrame = useEditor.getState().frame;
    const t0 = performance.now();
    const tick = (now: number) => {
      const f = (startFrame + Math.floor(((now - t0) / 1000) * parsed.fps)) % parsed.durationInFrames;
      if (f !== useEditor.getState().frame) useEditor.getState().setFrame(f);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);
}
