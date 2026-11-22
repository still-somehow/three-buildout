import { ThreeCanvas } from "@remotion/three";
import type { ResolvedScene } from "../../scene/animation";
import { SceneContent, type RenderOptions } from "../../scene/SceneContent";
import { BoundsBox, FittedCameraRig, figurePosition, ScaleFigure, withFigure } from "../../qa/QAHelpers";
import type { Bounds } from "../../qa/stats";
import { fitView, VIEWS, type ViewName } from "../../qa/views";

export type ViewPanelProps = {
  scene: ResolvedScene;
  bounds: Bounds;
  view: ViewName;
  width: number;
  height: number;
  label?: string;
  caption?: string;
  options?: RenderOptions;
  showFigure?: boolean;
  showBounds?: boolean;
  azimuth?: number;
};

const labelStyle: React.CSSProperties = {
  position: "absolute",
  left: 10,
  color: "#e8e8e8",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 15,
  textShadow: "0 1px 2px #000",
  letterSpacing: 0.5,
};

/** One camera view of a scene, framed on `bounds`, with a label and caption. */
export const ViewPanel: React.FC<ViewPanelProps> = ({
  scene,
  bounds,
  view,
  width,
  height,
  label,
  caption,
  options,
  showFigure = true,
  showBounds = false,
  azimuth = 0,
}) => {
  const spec = VIEWS[view];
  const side = view === "left" || view === "right" ? "z" : "x";
  const framed = showFigure ? withFigure(bounds, side) : bounds;
  const camera = fitView(spec, framed, width / height, 1.15, azimuth);

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", outline: "1px solid #444" }}>
      <ThreeCanvas width={width} height={height} orthographic={spec.ortho} gl={{ antialias: true }}>
        <FittedCameraRig camera={camera} />
        <SceneContent scene={scene} options={options} />
        {showFigure && <ScaleFigure position={figurePosition(bounds, side)} />}
        {showBounds && <BoundsBox bounds={bounds} />}
      </ThreeCanvas>
      <div style={{ ...labelStyle, top: 8 }}>{label ?? spec.label}</div>
      {caption && <div style={{ ...labelStyle, bottom: 8, color: "#ffd479" }}>{caption}</div>}
    </div>
  );
};
