/**
 * The ONE scene renderer. Lives inside any R3F canvas (Remotion's ThreeCanvas
 * or the editor's Canvas). Deterministic: output depends only on props.
 */
import { useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ResolvedScene } from "./animation";
import { buildGeometry, resolveColor, shapeHeight } from "./primitives";
import type { Camera, Light, SceneObject, Shape } from "./schema";

const DEG = Math.PI / 180;
const toRad = (v: readonly [number, number, number]) => [v[0] * DEG, v[1] * DEG, v[2] * DEG] as const;

export type SceneContentProps = {
  scene: ResolvedScene;
  /** Called with each object's root Object3D (editor uses it for selection). */
  onObjectRef?: (id: string, obj: THREE.Object3D | null) => void;
};

export const SceneContent: React.FC<SceneContentProps> = ({ scene, onObjectRef }) => {
  const children = useMemo(() => {
    const map = new Map<string | undefined, SceneObject[]>();
    for (const o of scene.objects) {
      const list = map.get(o.parent) ?? [];
      list.push(o);
      map.set(o.parent, list);
    }
    return map;
  }, [scene.objects]);

  const { shadows, edges, grid } = scene.settings;

  return (
    <>
      <color attach="background" args={[scene.settings.background]} />
      {scene.lights.map((l, i) => (
        <SceneLight key={i} light={l} shadows={shadows} />
      ))}
      {grid && <gridHelper args={[20, 20, "#8a8a8a", "#4c4c4c"]} position={[0, 0.001, 0]} />}
      {(children.get(undefined) ?? []).map((o) => (
        <ObjectNode key={o.id} object={o} childMap={children} edges={edges} shadows={shadows} onObjectRef={onObjectRef} />
      ))}
    </>
  );
};

type NodeProps = {
  object: SceneObject;
  childMap: Map<string | undefined, SceneObject[]>;
  edges: boolean;
  shadows: boolean;
  onObjectRef?: SceneContentProps["onObjectRef"];
};

const ObjectNode: React.FC<NodeProps> = ({ object, childMap, edges, shadows, onObjectRef }) => {
  const { position, rotation, scale } = object.transform;
  return (
    <group
      name={object.id}
      userData={{ sceneObjectId: object.id }}
      ref={onObjectRef ? (g) => onObjectRef(object.id, g) : undefined}
      position={position}
      rotation={toRad(rotation)}
      scale={scale}
      visible={object.visible}
    >
      {object.type === "primitive" && (
        <Primitive shape={object.shape} color={object.color} pivot={object.pivot} edges={edges} shadows={shadows} />
      )}
      {(childMap.get(object.id) ?? []).map((c) => (
        <ObjectNode key={c.id} object={c} childMap={childMap} edges={edges} shadows={shadows} onObjectRef={onObjectRef} />
      ))}
    </group>
  );
};

const Primitive: React.FC<{
  shape: Shape;
  color: string;
  pivot: "bottom" | "center" | "top";
  edges: boolean;
  shadows: boolean;
}> = ({ shape, color, pivot, edges, shadows }) => {
  const shapeKey = JSON.stringify(shape);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => buildGeometry(shape), [shapeKey]);
  const edgeGeometry = useMemo(() => (edges ? new THREE.EdgesGeometry(geometry, 25) : null), [geometry, edges]);
  const h = shapeHeight(shape);
  const offsetY = pivot === "bottom" ? h / 2 : pivot === "top" ? -h / 2 : 0;

  return (
    <group position={[0, offsetY, 0]}>
      <mesh geometry={geometry} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          color={resolveColor(color)}
          flatShading
          roughness={0.9}
          metalness={0}
          side={shape.kind === "plane" ? THREE.DoubleSide : THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial color="#1e1f22" transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
};

const SceneLight: React.FC<{ light: Light; shadows: boolean }> = ({ light, shadows }) => {
  switch (light.type) {
    case "ambient":
      return <ambientLight color={light.color} intensity={light.intensity} />;
    case "hemisphere":
      return <hemisphereLight args={[light.sky, light.ground, light.intensity]} />;
    case "directional":
      return <DirectionalLight light={light} shadows={shadows} />;
    case "point":
      return (
        <pointLight
          color={light.color}
          intensity={light.intensity}
          position={light.position}
          distance={light.distance}
          castShadow={shadows}
        />
      );
  }
};

const DirectionalLight: React.FC<{ light: Extract<Light, { type: "directional" }>; shadows: boolean }> = ({
  light,
  shadows,
}) => {
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(...light.target);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        color={light.color}
        intensity={light.intensity}
        position={light.position}
        target={target}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
    </>
  );
};

/** Drives the canvas's default camera from a scene camera. Used for renders, not the editor. */
export const SceneCamera: React.FC<{ camera: Camera }> = ({ camera }) => {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    cam.fov = camera.fov;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.position.set(...camera.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(...camera.target);
    cam.updateProjectionMatrix();
    invalidate();
  }, [cam, camera, invalidate]);
  return null;
};
