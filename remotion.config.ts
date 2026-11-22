import { Config } from "@remotion/cli/config";

// CPU-only WebGL (SwiftShader via ANGLE) — no GPU needed in Codespaces.
Config.setChromiumOpenGlRenderer("swangle");
// Keep memory/CPU use modest on small Codespace machines.
Config.setConcurrency(2);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Optional: use an already-installed Chrome instead of Remotion's download
// (useful in sandboxes without access to remotion.media).
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}
