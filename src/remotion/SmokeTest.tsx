import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

/** Minimal greybox scene proving headless CPU WebGL rendering works. */
export const SmokeTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const angle = (frame / durationInFrames) * Math.PI * 2;

  return (
    <AbsoluteFill style={{ backgroundColor: "#2b2d31" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [4, 3, 6], fov: 40 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.75, 0)}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 4]} intensity={1.5} />
        <gridHelper args={[10, 10, "#888", "#555"]} />
        <mesh position={[0, 0.75, 0]} rotation={[0, angle, 0]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial color="#b0b0b0" flatShading />
        </mesh>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
