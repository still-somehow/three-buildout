import { create } from "zustand";
import { parseScene, type Scene } from "../src/scene/schema";
import type { SceneDoc } from "./core/doc";

export type Selection =
  | { kind: "object"; id: string }
  | { kind: "joint"; rigId: string; joint: string }
  | { kind: "camera"; id: string }
  | null;

export type GizmoMode = "translate" | "rotate" | "scale";

type State = {
  scenes: { slug: string; name: string }[];
  slug: string | null;
  doc: SceneDoc | null;
  /** Last successfully parsed scene (rendering keeps working while a doc is invalid). */
  parsed: Scene | null;
  errors: string[];
  savedJson: string;
  past: SceneDoc[];
  future: SceneDoc[];
  frame: number;
  playing: boolean;
  selection: Selection;
  gizmo: GizmoMode;
  /** Look through this scene camera instead of the free orbit camera. */
  viewCamera: string | null;
  showPreview: boolean;
  status: string;
  externalChange: boolean;
};

type Actions = {
  refreshList(): Promise<void>;
  load(slug: string): Promise<void>;
  createScene(slug: string): Promise<void>;
  /** Apply an edit (pushes undo history). Throwing edits are reported in the status bar. */
  edit(fn: (doc: SceneDoc) => SceneDoc, label?: string): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
  setFrame(frame: number): void;
  set(patch: Partial<State>): void;
};

export const isDirty = (s: State) => !!s.doc && JSON.stringify(s.doc) !== s.savedJson;

function check(doc: SceneDoc): { parsed: Scene | null; errors: string[] } {
  try {
    return { parsed: parseScene(doc), errors: [] };
  } catch (e) {
    return { parsed: null, errors: (e as Error).message.split("\n").slice(1).map((l) => l.trim()) };
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/scenes${path}`, { headers: { "content-type": "application/json" }, ...init });
  const body = await res.json();
  if (!res.ok) throw new Error((body.errors ?? ["request failed"]).join("\n"));
  return body as T;
}

export const useEditor = create<State & Actions>((set, get) => ({
  scenes: [],
  slug: null,
  doc: null,
  parsed: null,
  errors: [],
  savedJson: "",
  past: [],
  future: [],
  frame: 0,
  playing: false,
  selection: null,
  gizmo: "translate",
  viewCamera: null,
  showPreview: false,
  status: "",
  externalChange: false,

  async refreshList() {
    set({ scenes: await api<State["scenes"]>("") });
  },

  async load(slug) {
    const { doc } = await api<{ doc: SceneDoc }>(`/${slug}`);
    const { parsed, errors } = check(doc);
    const keepFrame = get().slug === slug;
    set({
      slug,
      doc,
      parsed,
      errors,
      savedJson: JSON.stringify(doc),
      past: [],
      future: [],
      frame: keepFrame ? Math.min(get().frame, (parsed?.durationInFrames ?? 1) - 1) : 0,
      selection: keepFrame ? get().selection : null,
      viewCamera: keepFrame ? get().viewCamera : null,
      externalChange: false,
      status: `Loaded scenes/${slug}.scene.json`,
    });
    const url = new URL(location.href);
    url.searchParams.set("scene", slug);
    history.replaceState(null, "", url);
  },

  async createScene(slug) {
    try {
      await api("", { method: "POST", body: JSON.stringify({ slug }) });
      await get().refreshList();
      await get().load(slug);
    } catch (e) {
      set({ status: (e as Error).message });
    }
  },

  edit(fn, label) {
    const { doc, past } = get();
    if (!doc) return;
    let next: SceneDoc;
    try {
      next = fn(doc);
    } catch (e) {
      set({ status: `⚠ ${(e as Error).message}` });
      return;
    }
    if (next === doc) return;
    const { parsed, errors } = check(next);
    set({
      doc: next,
      parsed: parsed ?? get().parsed,
      errors,
      past: [...past.slice(-199), doc],
      future: [],
      status: label ?? "",
    });
  },

  undo() {
    const { past, doc, future } = get();
    if (!past.length || !doc) return;
    const prev = past[past.length - 1];
    const { parsed, errors } = check(prev);
    set({ doc: prev, parsed: parsed ?? get().parsed, errors, past: past.slice(0, -1), future: [doc, ...future], status: "Undo" });
  },

  redo() {
    const { past, doc, future } = get();
    if (!future.length || !doc) return;
    const next = future[0];
    const { parsed, errors } = check(next);
    set({ doc: next, parsed: parsed ?? get().parsed, errors, past: [...past, doc], future: future.slice(1), status: "Redo" });
  },

  async save() {
    const { doc, slug, errors } = get();
    if (!doc || !slug) return;
    if (errors.length) {
      set({ status: "⚠ Fix the errors before saving (files on disk are always kept valid)" });
      return;
    }
    try {
      await api(`/${slug}`, { method: "PUT", body: JSON.stringify(doc) });
      set({ savedJson: JSON.stringify(doc), status: `Saved scenes/${slug}.scene.json`, externalChange: false });
    } catch (e) {
      set({ status: `⚠ Save failed: ${(e as Error).message}` });
    }
  },

  setFrame(frame) {
    const max = (get().parsed?.durationInFrames ?? 1) - 1;
    set({ frame: Math.max(0, Math.min(max, Math.round(frame))) });
  },

  set(patch) {
    set(patch);
  },
}));
