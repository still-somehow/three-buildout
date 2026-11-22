import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { resolveScene } from "../../scene/animation";
import { SceneContent } from "../../scene/SceneContent";
import { parseScene } from "../../scene/schema";
import { FittedCameraRig } from "../../qa/QAHelpers";
import type { Bounds } from "../../qa/stats";
import { fitView } from "../../qa/views";
import { RIGS } from "../../rig/registry";

export const POSES_PER_ROW = 5;
export const POSE_ROW_HEIGHT = 600;
export const POSES_HEADER = 70;
export const POSES_WIDTH = 1920;
const SPACING = 1.3;

export const posesSheetHeight = (rig: string) =>
  POSES_HEADER + Math.ceil(Object.keys(RIGS[rig].poses).length / POSES_PER_ROW) * POSE_ROW_HEIGHT;

const VIEW = { label: "", ortho: true, dir: [0.45, 0.25, 1] as [number, number, number], up: [0, 1, 0] as [number, number, number] };

/** Every pose in a rig's library, lined up with its name: QA + reference card. */
export const RigPoses: React.FC<{ rig: string; color?: string }> = ({ rig, color = "blue" }) => {
  const def = RIGS[rig];
  const names = Object.keys(def.poses);
  const rows = Array.from({ length: Math.ceil(names.length / POSES_PER_ROW) }, (_, r) =>
    names.slice(r * POSES_PER_ROW, (r + 1) * POSES_PER_ROW),
  );
  const halfW = (POSES_PER_ROW * SPACING) / 2;
  // Extra headroom above 1.8 m for the labels.
  const bounds: Bounds = { min: [-halfW, -0.35, -0.6], max: [halfW, 2.35, 0.6], size: [halfW * 2, 2.7, 1.2], center: [0, 1.0, 0] };
  const camera = fitView(VIEW, bounds, POSES_WIDTH / POSE_ROW_HEIGHT, 1.04);
  const slotX = (i: number) => (i - (POSES_PER_ROW - 1) / 2) * SPACING;

  // Screen x of each slot, for the labels.
  const labelX = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-camera.viewWidth / 2, camera.viewWidth / 2, camera.viewHeight / 2, -camera.viewHeight / 2, camera.near, camera.far);
    cam.position.set(...camera.position);
    cam.up.set(...camera.up);
    cam.lookAt(...camera.target);
    cam.updateMatrixWorld();
    return Array.from({ length: POSES_PER_ROW }, (_, i) => ((new THREE.Vector3(slotX(i), 0, 0).project(cam).x + 1) / 2) * POSES_WIDTH);
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AbsoluteFill style={{ background: "#1b1c1f", fontFamily: "ui-monospace, Menlo, monospace", color: "#ddd" }}>
      <div style={{ height: POSES_HEADER, padding: "18px 24px", boxSizing: "border-box", fontSize: 26, color: "#fff" }}>
        POSE LIBRARY · {rig} · {def.height} m · {names.length} poses
      </div>
      {rows.map((row, r) => {
        const scene = resolveScene(
          parseScene({
            name: `${rig}-poses-${r}`,
            durationInFrames: 1,
            settings: { grid: true },
            cameras: [{ id: "c", position: [0, 1, 5] }],
            objects: row.map((pose, i) => ({ id: `m${i}`, type: "rig", rig, pose, color, transform: { position: [slotX(i), 0, 0] } })),
          }),
          0,
        );
        return (
          <div key={r} style={{ position: "relative", width: POSES_WIDTH, height: POSE_ROW_HEIGHT, borderTop: "1px solid #333" }}>
            <ThreeCanvas width={POSES_WIDTH} height={POSE_ROW_HEIGHT} orthographic gl={{ antialias: true }}>
              <FittedCameraRig camera={camera} />
              <SceneContent scene={scene} options={{ backfaces: true, skeleton: true }} />
            </ThreeCanvas>
            {row.map((pose, i) => (
              <div
                key={pose}
                style={{ position: "absolute", top: 12, left: labelX[i] - 125, width: 250, textAlign: "center", lineHeight: 1.3 }}
              >
                <div style={{ fontSize: 22, color: "#ffd479" }}>{pose}</div>
                <div style={{ fontSize: 13, color: "#999" }}>{def.poses[pose].description}</div>
              </div>
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
