import { resolve } from "node:path";
import { defineConfig } from "vite";
import { scenesApi } from "./editor/scenesApi";

const inCodespaces = !!process.env.CODESPACES;

// The greybox editor: `npm run editor` → http://localhost:5173
export default defineConfig({
  root: resolve(__dirname, "editor"),
  // Same public/ as Remotion, so reference images (public/refs) are served too.
  publicDir: resolve(__dirname, "public"),
  plugins: [scenesApi(resolve(__dirname, "scenes"))],
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    // Codespaces serves forwarded ports from *.app.github.dev over HTTPS.
    allowedHosts: [".app.github.dev", "localhost"],
    hmr: inCodespaces ? { clientPort: 443 } : undefined,
    fs: { allow: [resolve(__dirname)] },
  },
  build: { outDir: resolve(__dirname, "dist/editor"), emptyOutDir: true },
});
