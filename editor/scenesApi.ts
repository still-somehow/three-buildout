/**
 * Vite dev-server plugin: a tiny REST API over scenes/*.scene.json.
 *
 *   GET  /api/scenes            → [{ slug, name }]
 *   GET  /api/scenes/:slug      → { slug, doc }
 *   PUT  /api/scenes/:slug      → validates, writes formatted JSON → { ok } | 400 { errors }
 *   POST /api/scenes            → { slug } creates a starter scene
 *
 * External edits (e.g. Claude editing the JSON) are pushed to the browser as
 * the custom HMR event "scene-changed" with { slug }.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Plugin } from "vite";
import { formatSceneJson } from "../src/scene/format";
import { SceneSchema } from "../src/scene/schema";

const SLUG = /^[a-zA-Z0-9_-]+$/;

export function scenesApi(scenesDir: string): Plugin {
  const fileFor = (slug: string) => join(scenesDir, `${slug}.scene.json`);
  // Contents we wrote ourselves, so the watcher doesn't echo our own saves.
  const ownWrites = new Map<string, string>();

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  const validate = (doc: unknown) => {
    const r = SceneSchema.safeParse(doc);
    return r.success ? null : r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  };

  return {
    name: "scenes-api",
    configureServer(server) {
      server.watcher.add(scenesDir);
      server.watcher.on("change", (file) => {
        const m = file.match(/([^/\\]+)\.scene\.json$/);
        if (!m || !file.startsWith(scenesDir)) return;
        const text = readFileSync(file, "utf8");
        if (ownWrites.get(m[1]) === text) return;
        server.ws.send({ type: "custom", event: "scene-changed", data: { slug: m[1] } });
      });

      server.middlewares.use("/api/scenes", async (req, res) => {
        try {
          const slug = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
          if (!slug) {
            if (req.method === "GET") {
              const list = readdirSync(scenesDir)
                .filter((f) => f.endsWith(".scene.json"))
                .sort()
                .map((f) => {
                  const s = f.replace(/\.scene\.json$/, "");
                  let name = s;
                  try {
                    name = JSON.parse(readFileSync(join(scenesDir, f), "utf8")).name ?? s;
                  } catch {
                    /* show the slug for unreadable files */
                  }
                  return { slug: s, name };
                });
              return send(res, 200, list);
            }
            if (req.method === "POST") {
              const { slug: newSlug } = JSON.parse(await readBody(req));
              if (!SLUG.test(newSlug)) return send(res, 400, { errors: ["name: letters, digits, _ and - only"] });
              if (existsSync(fileFor(newSlug))) return send(res, 400, { errors: [`scenes/${newSlug}.scene.json already exists`] });
              const doc = {
                name: newSlug,
                fps: 24,
                durationInFrames: 96,
                cameras: [{ id: "cam1", position: [5, 3, 6], target: [0, 1, 0], fov: 40 }],
                objects: [{ id: "floor", type: "primitive", shape: { kind: "plane", size: [10, 10] }, color: "floor" }],
                shots: [{ id: "sh010", camera: "cam1", start: 0, end: 96 }],
              };
              const text = formatSceneJson(doc);
              ownWrites.set(newSlug, text);
              writeFileSync(fileFor(newSlug), text);
              return send(res, 200, { slug: newSlug });
            }
            return send(res, 405, { errors: ["method not allowed"] });
          }

          if (!SLUG.test(slug)) return send(res, 400, { errors: ["bad scene name"] });
          if (req.method === "GET") {
            if (!existsSync(fileFor(slug))) return send(res, 404, { errors: [`no scenes/${slug}.scene.json`] });
            return send(res, 200, { slug, doc: JSON.parse(readFileSync(fileFor(slug), "utf8")) });
          }
          if (req.method === "PUT") {
            const doc = JSON.parse(await readBody(req));
            const errors = validate(doc);
            if (errors) return send(res, 400, { errors });
            const text = formatSceneJson(doc);
            ownWrites.set(slug, text);
            writeFileSync(fileFor(slug), text);
            return send(res, 200, { ok: true });
          }
          return send(res, 405, { errors: ["method not allowed"] });
        } catch (e) {
          send(res, 500, { errors: [(e as Error).message] });
        }
      });
    },
  };
}
