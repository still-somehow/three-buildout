import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fmt, prepareQA, type QAProps } from "./prepare";
import { ViewPanel } from "./ViewPanel";

/** 360° orbit around the scene or an isolated object, with the scale figure. */
export const Turntable: React.FC<QAProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const { scene, stats, bounds } = useMemo(() => prepareQA(props), [props]);
  const azimuth = (frame / durationInFrames) * 360;
  const [w, h, d] = bounds.size;

  return (
    <AbsoluteFill style={{ background: "#1b1c1f" }}>
      <ViewPanel
        scene={scene}
        bounds={bounds}
        view="persp"
        width={width}
        height={height}
        azimuth={azimuth}
        options={{ backfaces: true }}
        label={`TURNTABLE · ${props.objectId ?? scene.name} · ${Math.round(azimuth)}°`}
        caption={`W ${fmt(w)} × H ${fmt(h)} × D ${fmt(d)} m · ${stats.triangles} tris`}
      />
    </AbsoluteFill>
  );
};
