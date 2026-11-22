import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { activeCamera, resolveScene } from "../scene/animation";
import { SceneCamera, SceneContent } from "../scene/SceneContent";
import type { Scene } from "../scene/schema";

export type SceneCompositionProps = {
  scene: Scene;
  /** Offset into the scene timeline (a shot composition starts at its shot's start). */
  startFrame?: number;
  /** Force a camera; otherwise shots act as camera cuts. */
  cameraId?: string;
};

/** Renders a scene at the current Remotion frame. */
export const SceneComposition: React.FC<SceneCompositionProps> = ({ scene, startFrame = 0, cameraId }) => {
  const frame = useCurrentFrame() + startFrame;
  const { width, height } = useVideoConfig();
  const resolved = useMemo(() => resolveScene(scene, frame), [scene, frame]);
  const camera = activeCamera(resolved, frame, cameraId);

  return (
    <AbsoluteFill style={{ backgroundColor: scene.settings.background }}>
      <ThreeCanvas width={width} height={height} shadows={scene.settings.shadows} gl={{ antialias: true }}>
        <SceneCamera camera={camera} />
        <SceneContent scene={resolved} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
