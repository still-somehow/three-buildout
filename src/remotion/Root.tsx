import { AbsoluteFill, Composition } from "remotion";
import { compId, loadScenes } from "../scene/loadScenes";
import { SceneComposition } from "./SceneComposition";
import { SmokeTest } from "./SmokeTest";

const ErrorCard: React.FC<{ message: string }> = ({ message }) => (
  <AbsoluteFill style={{ background: "#3a1f1f", color: "#ffd9d9", padding: 40, fontFamily: "monospace", fontSize: 22 }}>
    <pre style={{ whiteSpace: "pre-wrap" }}>{message}</pre>
  </AbsoluteFill>
);

/**
 * For each scenes/<slug>.scene.json:
 *   <slug>           whole timeline; shots act as camera cuts
 *   <slug>-<shotId>  one composition per shot (export unit / storyboard panel)
 */
export const RemotionRoot: React.FC = () => (
  <>
    {loadScenes().map((entry) => {
      if ("error" in entry) {
        return (
          <Composition
            key={entry.slug}
            id={compId("INVALID", entry.slug)}
            component={ErrorCard}
            defaultProps={{ message: entry.error }}
            durationInFrames={1}
            fps={24}
            width={1280}
            height={720}
          />
        );
      }
      const { slug, scene } = entry;
      const common = { component: SceneComposition, fps: scene.fps, width: scene.width, height: scene.height };
      return [
        <Composition
          key={slug}
          id={compId(slug)}
          {...common}
          durationInFrames={scene.durationInFrames}
          defaultProps={{ scene }}
        />,
        ...scene.shots.map((shot) => (
          <Composition
            key={`${slug}/${shot.id}`}
            id={compId(slug, shot.id)}
            {...common}
            durationInFrames={shot.end - shot.start}
            defaultProps={{ scene, startFrame: shot.start, cameraId: shot.camera }}
          />
        )),
      ];
    })}
    <Composition id="SmokeTest" component={SmokeTest} durationInFrames={60} fps={30} width={1280} height={720} />
  </>
);
