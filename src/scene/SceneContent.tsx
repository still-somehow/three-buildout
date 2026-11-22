/**
 * The ONE scene renderer. Lives inside any R3F canvas (Remotion's ThreeCanvas
 * or the editor's Canvas). Deterministic: output depends only on props.
 */
import { createContext, useContext, useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ResolvedScene } from "./animation";
import { pivotOffsetY } from "./build";
import { buildGeometry, resolveColor } from "./primitives";
import type { Camera, Light, SceneObject, Shape } from "./schema";

const DEG = Math.PI / 180;
const toRad = (v: readonly [number, number, number]) => [v[0] * DEG, v[1] * DEG, v[2] * DEG] as const;

/** QA display modes. All off = normal greybox render. */
export type RenderOptions = {
  /** Wireframe instead of shaded surfaces. */
  wireframe?: boolean;
  /** Paint back faces magenta: visible magenta = flipped normals or holes. */
  backfaces?: boolean;
  /** Small XYZ axes at every object's origin (pivot). Skips rig body parts. */
  axes?: boolean;
  /** Rig skeletons drawn on top (joint dots and bones): all rigs, or only the rig with this id. */
  skeleton?: boolean | string;
  /** Override scene.settings.grid. */
  grid?: boolean;
};

const OptionsContext = createContext<RenderOptions>({});

/** For helpers that must never be picked by clicks (outlines, grid, overlays). */
const noRaycast = () => null;

export type SceneContentProps = {
  scene: ResolvedScene;
  options?: RenderOptions;
  /** Called with each object's root Object3D (editor uses it for selection). */
  onObjectRef?: (id: string, obj: THREE.Object3D | null) => void;
};

export const SceneContent: React.FC<SceneContentProps> = ({ scene, options = {}, onObjectRef }) => {
  const children = useMemo(() => {
    const map = new Map<string | undefined, SceneObject[]>();
    for (const o of scene.objects) {
      const list = map.get(o.parent) ?? [];
      list.push(o);
      map.set(o.parent, list);
    }
    return map;
  }, [scene.objects]);

  const { shadows, edges } = scene.settings;
  const grid = options.grid ?? scene.settings.grid;

  return (
    <OptionsContext.Provider value={options}>
      <color attach="background" args={[scene.settings.background]} />
      {scene.lights.map((l, i) => (
        <SceneLight key={i} light={l} shadows={shadows} />
      ))}
      {grid && <gridHelper args={[20, 20, "#8a8a8a", "#4c4c4c"]} position={[0, 0.001, 0]} raycast={noRaycast} />}
      {(children.get(undefined) ?? []).map((o) => (
        <ObjectNode key={o.id} object={o} childMap={children} edges={edges} shadows={shadows} onObjectRef={onObjectRef} />
      ))}
    </OptionsContext.Provider>
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
  const { axes, skeleton } = useContext(OptionsContext);
  const kids = childMap.get(object.id) ?? [];
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
      {axes && !object.rigPart && <axesHelper args={[object.rigJoint ? 0.08 : 0.15]} raycast={noRaycast} />}
      {object.rigJoint && (skeleton === true || (typeof skeleton === "string" && object.id.startsWith(skeleton + "/"))) && (
        <JointMarker childOffsets={kids.filter((c) => c.rigJoint).map((c) => c.transform.position)} />
      )}
      {object.type === "primitive" && (
        <Primitive shape={object.shape} color={object.color} pivot={object.pivot} edges={edges} shadows={shadows} />
      )}
      {kids.map((c) => (
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
  const { wireframe, backfaces } = useContext(OptionsContext);
  const isPlane = shape.kind === "plane";
  const showBackfaces = !!backfaces && !isPlane && !wireframe;

  return (
    <group position={[0, pivotOffsetY(shape, pivot), 0]}>
      <mesh geometry={geometry} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          // Remount when the backface mode toggles so the shader recompiles.
          key={showBackfaces ? "bf" : "std"}
          color={resolveColor(color)}
          wireframe={wireframe}
          flatShading
          roughness={0.9}
          metalness={0}
          side={isPlane || showBackfaces ? THREE.DoubleSide : THREE.FrontSide}
          onBeforeCompile={showBackfaces ? paintBackfaces : undefined}
          customProgramCacheKey={showBackfaces ? () => "backfaces" : undefined}
          // Pushes faces back a hair so outlines draw cleanly on top. In QA mode the
          // slope-scaled term is dropped: on grazing faces it can exceed the back-face bias.
          polygonOffset
          polygonOffsetFactor={showBackfaces ? 0 : 1}
          polygonOffsetUnits={showBackfaces ? 2 : 1}
        />
      </mesh>
      {edgeGeometry && !wireframe && (
        <lineSegments geometry={edgeGeometry} raycast={noRaycast}>
          <lineBasicMaterial color="#1e1f22" transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
};

/** Joint dot + bones to child joints, drawn over everything. */
const JointMarker: React.FC<{ childOffsets: [number, number, number][] }> = ({ childOffsets }) => {
  const key = JSON.stringify(childOffsets);
  const bones = useMemo(() => {
    const pts = childOffsets.flatMap((p) => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(...p)]);
    return pts.length ? new THREE.BufferGeometry().setFromPoints(pts) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <>
      <mesh renderOrder={1000} raycast={noRaycast}>
        <sphereGeometry args={[0.022, 8, 6]} />
        <meshBasicMaterial color="#ffe14d" depthTest={false} transparent />
      </mesh>
      {bones && (
        <lineSegments geometry={bones} renderOrder={999} raycast={noRaycast}>
          <lineBasicMaterial color="#ffe14d" depthTest={false} transparent />
        </lineSegments>
      )}
    </>
  );
};

/**
 * QA shader patch: any back-facing fragment that wins the depth test is painted
 * magenta. On a closed, correctly wound mesh that never happens, so visible
 * magenta means flipped normals or a hole. Back faces are also pushed slightly
 * deeper so they can't tie with front faces where the two meet at a silhouette;
 * that can't hide a real hole (nothing covers it) or a flipped face (the inside
 * behind it is back-facing too).
 */
function paintBackfaces(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <dithering_fragment>",
    `#include <dithering_fragment>
  if (!gl_FrontFacing) gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
  gl_FragDepth = gl_FrontFacing ? gl_FragCoord.z : min(1.0, gl_FragCoord.z + 0.002);`,
  );
}

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
