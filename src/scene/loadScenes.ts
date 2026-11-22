/**
 * Bundles every scenes/*.scene.json into the Remotion project (webpack
 * require.context), validated. Drop a new file in scenes/ and it appears in Studio.
 */
import { parseScene, type Scene } from "./schema";

declare const require: {
  context(dir: string, recursive: boolean, re: RegExp): {
    keys(): string[];
    (key: string): unknown;
  };
};

export type LoadedScene = { slug: string; scene: Scene } | { slug: string; error: string };

export function loadScenes(): LoadedScene[] {
  const ctx = require.context("../../scenes", false, /\.scene\.json$/);
  return ctx
    .keys()
    .filter((k) => k.startsWith("./"))
    .sort()
    .map((key) => {
      const slug = key.replace(/^\.\//, "").replace(/\.scene\.json$/, "");
      try {
        return { slug, scene: parseScene(ctx(key), `scenes/${slug}.scene.json`) };
      } catch (e) {
        return { slug, error: (e as Error).message };
      }
    });
}

/** Remotion composition ids allow only a-z, A-Z, 0-9 and "-". */
export const compId = (...parts: string[]) => parts.join("-").replace(/[^a-zA-Z0-9-]/g, "-");
