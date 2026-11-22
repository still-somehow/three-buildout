import { Player } from "@remotion/player";
import { useEffect } from "react";
import { SceneComposition } from "../src/remotion/SceneComposition";
import * as D from "./core/doc";
import { Inspector } from "./Inspector";
import { Outliner } from "./Outliner";
import { isDirty, useEditor } from "./store";
import { keySelection, Timeline } from "./Timeline";
import { Viewport } from "./Viewport";

export const App: React.FC = () => {
  const s = useEditor();
  const dirty = isDirty(s);

  useEffect(() => {
    (async () => {
      await s.refreshList();
      const want = new URL(location.href).searchParams.get("scene");
      const list = useEditor.getState().scenes;
      const slug = list.find((x) => x.slug === want)?.slug ?? list.find((x) => x.slug === "demo")?.slug ?? list[0]?.slug;
      if (slug) await s.load(slug);
    })().catch((e) => s.set({ status: `⚠ ${(e as Error).message}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useShortcuts();
  useExternalChanges();
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (isDirty(useEditor.getState())) e.preventDefault();
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">greybox</strong>
        <select
          value={s.slug ?? ""}
          onChange={async (e) => {
            if (e.target.value === "__new") {
              const name = prompt("New scene file name (letters, digits, - and _):");
              if (name) await s.createScene(name);
              return;
            }
            if (dirty && !confirm("Discard unsaved changes?")) return;
            await s.load(e.target.value);
          }}
        >
          {s.scenes.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.slug} — {x.name}
            </option>
          ))}
          <option value="__new">+ New scene…</option>
        </select>
        <button className={dirty ? "primary" : ""} onClick={s.save} title="Save (Ctrl+S)" disabled={!dirty}>
          {dirty ? "● Save" : "Saved"}
        </button>
        <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)">↶</button>
        <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">↷</button>
        <span className="sep" />
        {(["translate", "rotate", "scale"] as const).map((m, i) => (
          <button key={m} className={s.gizmo === m ? "active" : ""} onClick={() => s.set({ gizmo: m })} title={`${m} (${"WER"[i]})`}>
            {["Move", "Rotate", "Scale"][i]}
          </button>
        ))}
        <span className="sep" />
        <label className="inline">
          View
          <select value={s.viewCamera ?? ""} onChange={(e) => s.set({ viewCamera: e.target.value || null })}>
            <option value="">Free orbit</option>
            {s.doc?.cameras.map((c) => (
              <option key={c.id} value={c.id}>
                🎥 {c.id}
              </option>
            ))}
          </select>
        </label>
        <button className={s.showPreview ? "active" : ""} onClick={() => s.set({ showPreview: !s.showPreview })} title="Remotion preview: exactly what renders, with shot cuts">
          Preview
        </button>
        <span className="spacer" />
        <span className="help" title="W/E/R gizmo · K key · Space play · ←/→ frame · Del delete · Ctrl+D duplicate · Esc deselect · Ctrl+Z/Ctrl+Shift+Z undo/redo · Ctrl+S save">
          ⌨ shortcuts
        </span>
      </header>

      {s.externalChange && (
        <div className="banner">
          scenes/{s.slug}.scene.json changed on disk.{" "}
          <button onClick={() => s.load(s.slug!)}>Reload (discard my changes)</button>{" "}
          <button onClick={() => s.set({ externalChange: false })}>Keep mine</button>
        </div>
      )}
      {s.errors.length > 0 && (
        <div className="banner error">
          <strong>Scene is invalid, so it can't be saved.</strong> The view shows the last valid state.
          <ul>
            {s.errors.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <main className="workspace">
        <Outliner />
        <section className="center">
          <Viewport />
          {s.showPreview && s.parsed && (
            <div className="preview">
              <Player
                component={SceneComposition}
                inputProps={{ scene: s.parsed }}
                durationInFrames={s.parsed.durationInFrames}
                fps={s.parsed.fps}
                compositionWidth={s.parsed.width}
                compositionHeight={s.parsed.height}
                style={{ width: "100%" }}
                controls
                loop
              />
            </div>
          )}
        </section>
        <Inspector />
      </main>
      <Timeline />
      <footer className="status">{s.status}</footer>
    </div>
  );
};

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const typing = e.target instanceof HTMLElement && e.target.closest("input, select, textarea");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void st.save();
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (st.selection?.kind === "object") {
          const id = st.selection.id;
          let newId = "";
          st.edit((d) => {
            const r = D.duplicateObject(d, id);
            newId = r.newId;
            return r.doc;
          }, `Duplicated ${id}`);
          if (newId) st.set({ selection: { kind: "object", id: newId } });
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selection?.kind === "object") {
          const id = st.selection.id;
          st.edit((d) => D.deleteObject(d, id), `Deleted ${id}`);
          st.set({ selection: null });
        }
      } else if (e.key === "Escape") {
        st.set(st.viewCamera ? { viewCamera: null } : { selection: null });
      } else if (e.key === " ") {
        e.preventDefault();
        st.set({ playing: !st.playing });
      } else if (e.key === "ArrowLeft") st.setFrame(st.frame - (e.shiftKey ? 10 : 1));
      else if (e.key === "ArrowRight") st.setFrame(st.frame + (e.shiftKey ? 10 : 1));
      else if (e.key === "Home") st.setFrame(0);
      else if (e.key === "End") st.setFrame(Infinity);
      else if (e.key.toLowerCase() === "w") st.set({ gizmo: "translate" });
      else if (e.key.toLowerCase() === "e") st.set({ gizmo: "rotate" });
      else if (e.key.toLowerCase() === "r") st.set({ gizmo: "scale" });
      else if (e.key.toLowerCase() === "k") keySelection();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}

/** Reload when the scene file is edited outside the editor (silently if there are no unsaved edits). */
function useExternalChanges() {
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const handler = ({ slug }: { slug: string }) => {
      const st = useEditor.getState();
      void st.refreshList();
      if (slug !== st.slug) return;
      if (isDirty(st)) st.set({ externalChange: true });
      else void st.load(slug).then(() => useEditor.getState().set({ status: `Reloaded: scenes/${slug}.scene.json changed on disk` }));
    };
    hot.on("scene-changed", handler);
    return () => hot.off?.("scene-changed", handler);
  }, []);
}
