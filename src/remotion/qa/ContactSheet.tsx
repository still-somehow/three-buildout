import { useMemo } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { fmt, prepareQA, type QAProps } from "./prepare";
import { ViewPanel } from "./ViewPanel";

export const SHEET_WIDTH = 1920;
export const SHEET_HEIGHT = 1200;
const HEADER = 160;
const COLS = 3;
const PW = SHEET_WIDTH / COLS;
const PH = (SHEET_HEIGHT - HEADER) / 2;

const SEVERITY_COLOR = { error: "#ff6b6b", warning: "#ffc04d", info: "#8ab4ff" } as const;

/**
 * QA contact sheet: front / right / top orthographic, 3/4 perspective,
 * wireframe + bounds + pivots, and the reference image (or a 3/4 back view).
 * Orange figure = 1.8 m scale reference. Magenta = back faces (flipped normals / holes).
 */
export const ContactSheet: React.FC<QAProps> = (props) => {
  const { scene, stats, bounds } = useMemo(() => prepareQA(props), [props]);
  const [w, h, d] = bounds.size;
  const panel = { scene, bounds, width: PW, height: PH };
  const shaded = { backfaces: true };

  return (
    <AbsoluteFill style={{ background: "#1b1c1f", fontFamily: "ui-monospace, Menlo, monospace", color: "#ddd" }}>
      <div style={{ height: HEADER, padding: "14px 20px", boxSizing: "border-box", display: "flex", gap: 40 }}>
        <div style={{ flex: "0 0 760px" }}>
          <div style={{ fontSize: 26, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            QA · {props.objectId ?? scene.name}
          </div>
          <div style={{ fontSize: 16, marginTop: 8, lineHeight: 1.6 }}>
            scene "{scene.name}" · frame {props.frame ?? 0}
            <br />
            size W {fmt(w)} × H {fmt(h)} × D {fmt(d)} m · min y {fmt(bounds.min[1])}
            <br />
            {stats.primitives} primitives · {stats.triangles.toLocaleString()} tris · {stats.vertices.toLocaleString()} verts
          </div>
        </div>
        <div style={{ flex: 1, fontSize: 15, lineHeight: 1.5, overflow: "hidden" }}>
          {stats.issues.length === 0 ? (
            <div style={{ color: "#7ddc8a" }}>✓ no issues found</div>
          ) : (
            <>
              {stats.issues.slice(0, 5).map((i, n) => (
                <div key={n} style={{ color: SEVERITY_COLOR[i.severity], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {i.severity.toUpperCase()} {i.objectId ? `[${i.objectId}] ` : ""}
                  {i.message}
                </div>
              ))}
              {stats.issues.length > 5 && <div>…and {stats.issues.length - 5} more (see stats JSON)</div>}
            </>
          )}
          <div style={{ color: "#888", marginTop: 6, fontSize: 13 }}>
            orange = 1.8 m figure · magenta = back faces · yellow = bounds
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, ${PW}px)` }}>
        <ViewPanel {...panel} view="front" options={shaded} caption={`W ${fmt(w)}  H ${fmt(h)} m`} />
        <ViewPanel {...panel} view="right" options={shaded} caption={`D ${fmt(d)}  H ${fmt(h)} m`} />
        <ViewPanel {...panel} view="top" options={shaded} caption={`W ${fmt(w)}  D ${fmt(d)} m`} />
        <ViewPanel {...panel} view="persp" options={shaded} />
        <ViewPanel
          {...panel}
          view="persp"
          label="WIREFRAME · BOUNDS · PIVOTS"
          options={{ wireframe: true, axes: true }}
          showBounds
          showFigure={false}
        />
        {props.reference ? (
          <div style={{ position: "relative", width: PW, height: PH, outline: "1px solid #444", background: "#111" }}>
            <Img src={staticFile(props.reference)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            <div style={{ position: "absolute", top: 8, left: 10, fontSize: 15, textShadow: "0 1px 2px #000" }}>
              REFERENCE · {props.reference}
            </div>
          </div>
        ) : (
          <ViewPanel {...panel} view="persp-back" options={shaded} />
        )}
      </div>
    </AbsoluteFill>
  );
};
