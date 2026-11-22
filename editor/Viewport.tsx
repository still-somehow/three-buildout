import { OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { activeCamera, resolveScene } from "../src/scene/animation";
import { SceneCamera, SceneContent } from "../src/scene/SceneContent";
import type { Camera, Vec3 } from "../src/scene/schema";
import { RIGS } from "../src/rig/registry";
import * as D from "./core/doc";
import { orbitView } from "./hooks";
import { useEditor, type Selection } from "./store";

const RAD2DEG = 180 / Math.PI;
const CAM_PREFIX = "__cam:";

/** The Object3D name the gizmo should attach to for a selection. */
export function selectionNodeName(sel: Selection): string | null {
  if (!sel) return null;
  if (sel.kind === "object") return sel.id;
  if (sel.kind === "joint") return `${sel.rigId}/${sel.joint}`;
  return CAM_PREFIX + sel.id;
}

export const Viewport: React.FC = () => {
  const parsed = useEditor((s) => s.parsed);
  const frame = useEditor((s) => s.frame);
  const viewCamera = useEditor((s) => s.viewCamera);
  const selection = useEditor((s) => s.selection);
  const resolved = useMemo(() => (parsed ? resolveScene(parsed, frame) : null), [parsed, frame]);
  const box = useFittedBox(viewCamera && parsed ? parsed.width / parsed.height : null);

  if (!resolved) return <div className="empty">No scene loaded</div>;
  const lookCam = viewCamera ? resolved.cameras.find((c) => c.id === viewCamera) : undefined;
  // Skeleton overlay only for the selected rig.
  const skeletonRig =
    selection?.kind === "joint" ? selection.rigId : selection?.kind === "object" && resolved.objects.some((o) => o.id.startsWith(selection.id + "/")) ? selection.id : undefined;

  return (
    <div className="viewport" ref={box.ref}>
      <div style={box.style}>
        <Canvas
          camera={{ position: [6, 4, 8], fov: 45, near: 0.05, far: 500 }}
          gl={{ antialias: true }}
          onPointerMissed={(e) => e.button === 0 && useEditor.getState().set({ selection: null })}
        >
          <group onClick={onSceneClick}>
            <SceneContent scene={resolved} options={{ skeleton: skeletonRig }} />
          </group>
          {resolved.cameras.map((c) => c.id !== viewCamera && <CameraMarker key={c.id} camera={c} active={activeCamera(resolved, frame).id === c.id} />)}
          {lookCam ? <SceneCamera camera={lookCam} /> : <OrbitControls makeDefault enableDamping={false} target={orbitView.target.toArray()} />}
          {!lookCam && <OrbitTracker />}
          <SelectionGizmo />
        </Canvas>
      </div>
      {viewCamera && <div className="viewport-badge">Looking through “{viewCamera}” · Esc to exit</div>}
    </div>
  );
};

function onSceneClick(e: ThreeEvent<MouseEvent>) {
  let o: THREE.Object3D | null = e.object;
  while (o && !o.userData.sceneObjectId) o = o.parent;
  const id: string | undefined = o?.userData.sceneObjectId;
  if (!id) return; // not a scene object: let the event reach the next hit
  e.stopPropagation();
  if (e.delta > 4) return; // it was an orbit drag
  const { selection, set } = useEditor.getState();
  if (id.includes("/")) {
    // A rig part "<rig>/<joint>/<part>": first click selects the rig, the next its joint.
    const [rigId, joint] = id.split("/");
    const sameRig = (selection?.kind === "object" && selection.id === rigId) || (selection?.kind === "joint" && selection.rigId === rigId);
    set({ selection: sameRig ? { kind: "joint", rigId, joint } : { kind: "object", id: rigId } });
  } else {
    set({ selection: { kind: "object", id } });
  }
}

/** Keeps `orbitView` in sync with the free camera (used by "Set from current view"). */
const OrbitTracker: React.FC = () => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null;
  useFrame(() => {
    orbitView.position.copy(camera.position);
    if (controls?.target) orbitView.target.copy(controls.target);
    orbitView.fov = camera.fov;
  });
  return null;
};

/** Editor-only camera icon: body + lens pointing at the target, and a line to the target. */
const CameraMarker: React.FC<{ camera: Camera; active: boolean }> = ({ camera, active }) => {
  const selected = useEditor((s) => s.selection?.kind === "camera" && s.selection.id === camera.id);
  const quat = useMemo(() => {
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...camera.position), new THREE.Vector3(...camera.target), new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [camera.position, camera.target]);
  const line = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...camera.position), new THREE.Vector3(...camera.target)]),
    [camera.position, camera.target],
  );
  const color = selected ? "#ffd84d" : active ? "#7fd1ff" : "#c8c8c8";
  return (
    <>
      <group
        name={CAM_PREFIX + camera.id}
        position={camera.position}
        quaternion={quat}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta <= 4) useEditor.getState().set({ selection: { kind: "camera", id: camera.id } });
        }}
      >
        <mesh>
          <boxGeometry args={[0.22, 0.16, 0.3]} />
          <meshBasicMaterial color={color} wireframe />
        </mesh>
        <mesh position={[0, 0, -0.22]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.1, 0.14, 4, 1, true]} />
          <meshBasicMaterial color={color} wireframe />
        </mesh>
        <Label text={camera.id} color={color} position={[0, 0.22, 0]} />
      </group>
      <lineSegments geometry={line} raycast={() => null}>
        <lineDashedMaterial color={color} transparent opacity={0.4} />
      </lineSegments>
    </>
  );
};

/** Screen-facing text sprite (a canvas texture) that ignores depth and clicks. */
const Label: React.FC<{ text: string; color: string; position: Vec3 }> = ({ text, color, position }) => {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = "bold 40px monospace";
    c.width = Math.ceil(ctx.measureText(text).width) + 16;
    c.height = 56;
    ctx.font = "bold 40px monospace";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.fillText(text, 8, 42);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  const aspect = texture.image.width / texture.image.height;
  return (
    <sprite position={position} scale={[0.14 * aspect, 0.14, 1]} raycast={() => null} renderOrder={1001}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
};

/** Transform gizmo + highlight box on the selected node; commits to the doc on release. */
const SelectionGizmo: React.FC = () => {
  const selection = useEditor((s) => s.selection);
  const gizmo = useEditor((s) => s.gizmo);
  const threeScene = useThree((s) => s.scene);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const name = selectionNodeName(selection);

  // Re-find the node after every render: R3F may recreate groups when the scene changes.
  useLayoutEffect(() => {
    setTarget(name ? (threeScene.getObjectByName(name) ?? null) : null);
  });

  const helper = useMemo(() => (target ? new THREE.BoxHelper(target, "#ffd84d") : null), [target]);
  useFrame(() => helper?.update());
  useEffect(() => () => helper?.dispose(), [helper]);

  if (!target || !selection) return null;
  // Joints only rotate; cameras only move.
  const mode = selection.kind === "joint" ? "rotate" : selection.kind === "camera" ? "translate" : gizmo;

  const commit = () => {
    const { edit, frame } = useEditor.getState();
    const deg = (r: THREE.Euler): Vec3 => [r.x * RAD2DEG, r.y * RAD2DEG, r.z * RAD2DEG];
    if (selection.kind === "camera") {
      edit((d) => D.setCameraProp(d, selection.id, "position", target.position.toArray() as Vec3, frame), "Moved camera");
    } else if (selection.kind === "joint") {
      edit((d) => D.setJointRotation(d, selection.rigId, selection.joint, deg(target.rotation), frame), `Posed ${selection.joint}`);
    } else {
      const id = selection.id;
      let value: Vec3;
      if (mode === "translate") value = target.position.toArray() as Vec3;
      else if (mode === "rotate") value = deg(target.rotation);
      else {
        // Rig roots carry the height factor in their scale; store it without that.
        const docObj = D.getObject(useEditor.getState().doc!, id);
        const def = docObj?.type === "rig" ? RIGS[docObj.rig ?? "humanoid"] : undefined;
        const k = def && docObj?.type === "rig" ? (docObj.height ?? def.height) / def.height : 1;
        value = target.scale.toArray().map((v) => v / k) as Vec3;
      }
      edit((d) => D.setTransform(d, id, mode === "translate" ? "position" : mode === "rotate" ? "rotation" : "scale", value, frame), `Edited ${id}`);
    }
  };

  return (
    <>
      {helper && <primitive object={helper} raycast={() => null} />}
      <TransformControls object={target} mode={mode} space={selection.kind === "joint" ? "local" : "world"} size={0.8} onMouseUp={commit} />
    </>
  );
};

/** Letterboxes the canvas to `aspect` (when looking through a shot camera). */
function useFittedBox(aspect: number | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  let style: React.CSSProperties = { position: "absolute", inset: 0 };
  if (aspect && size.w && size.h) {
    const w = Math.min(size.w, size.h * aspect);
    const h = w / aspect;
    style = { position: "absolute", width: w, height: h, left: (size.w - w) / 2, top: (size.h - h) / 2, outline: "1px solid #7fd1ff" };
  }
  return { ref, style };
}
