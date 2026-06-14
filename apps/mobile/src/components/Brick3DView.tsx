import { Canvas, useFrame, useThree } from '@react-three/fiber';
import React, { useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import * as THREE from 'three';
import type { GeneratedModelDTO } from '../types';

/**
 * Vue 3D interactive du modèle LEGO (react-three-fiber + expo-gl).
 *
 * Choix de rendu :
 *  - InstancedMesh par type de pièce (1 draw call par référence) + un
 *    InstancedMesh de tenons : tient des modèles de 800+ briques à 60 fps.
 *  - couleur par instance (setColorAt) -> une seule passe matériau.
 *  - contrôles orbite/pinch implémentés via PanResponder (aucun provider
 *    racine requis), appliqués à la caméra dans useFrame par un ref mutable
 *    -> pas de re-render React pendant le geste = fluide.
 *
 * Proportions LEGO réelles : pas de tenon = 1 unité, brique = 1.2, plaque = 0.4.
 */

const PLATE_UNIT = 0.4; // hauteur d'une plaque (1 "plate") en unités de tenon
const SEAM = 0.06; // jeu horizontal entre briques (lisibilité des joints)
const VSEAM = 0.03;
const STUD_R = 0.3;
const STUD_H = 0.18;
const STUD_CAP = 6000; // au-delà, on n'affiche plus les tenons (perf)
const BG_COLOR = '#EFECE6';

interface BrickInstance {
  cx: number;
  cy: number;
  cz: number;
  rot: boolean;
  hex: string;
}

interface PartGroup {
  /** dimensions canoniques de la boîte [W, h, D] */
  size: [number, number, number];
  instances: BrickInstance[];
}

interface StudInstance {
  cx: number;
  cy: number;
  cz: number;
  hex: string;
}

interface SceneData {
  parts: PartGroup[];
  studs: StudInstance[];
  center: THREE.Vector3;
  boundingRadius: number;
}

function buildScene(model: GeneratedModelDTO, maxStep?: number): SceneData {
  const colorHex = new Map(model.colors.map((c) => [c.id, c.hex]));
  const partById = new Map(model.parts.map((p) => [p.id, p]));

  const bricks =
    maxStep !== undefined ? model.bricks.filter((b) => b.stepIndex <= maxStep) : model.bricks;

  // Hauteur (uniforme) et bas cumulé de chaque couche z.
  const layerHeight = new Map<number, number>();
  for (const b of bricks) {
    const part = partById.get(b.partId);
    const h = (part ? part.heightPlates : 3) * PLATE_UNIT;
    layerHeight.set(b.z, h);
  }
  const zs = [...layerHeight.keys()].sort((a, b) => a - b);
  const layerBottom = new Map<number, number>();
  let acc = 0;
  for (const z of zs) {
    layerBottom.set(z, acc);
    acc += layerHeight.get(z)!;
  }
  const totalHeight = acc || 1;

  const groupByPart = new Map<string, PartGroup>();
  const studs: StudInstance[] = [];
  let studCount = 0;

  for (const b of bricks) {
    const part = partById.get(b.partId);
    if (!part) continue;
    const W = part.widthStuds;
    const D = part.depthStuds;
    const h = part.heightPlates * PLATE_UNIT;
    const fw = b.rotated ? D : W;
    const fd = b.rotated ? W : D;
    const bottom = layerBottom.get(b.z) ?? 0;
    const hex = colorHex.get(b.colorId) ?? '#9aa0a6';

    let group = groupByPart.get(b.partId);
    if (!group) {
      group = { size: [W - SEAM, h - VSEAM, D - SEAM], instances: [] };
      groupByPart.set(b.partId, group);
    }
    group.instances.push({
      cx: b.x + fw / 2,
      cy: bottom + h / 2,
      cz: b.y + fd / 2,
      rot: b.rotated,
      hex,
    });

    if (studCount < STUD_CAP) {
      const top = bottom + h;
      for (let i = 0; i < fw; i++) {
        for (let j = 0; j < fd; j++) {
          studs.push({ cx: b.x + i + 0.5, cy: top + STUD_H / 2, cz: b.y + j + 0.5, hex });
          studCount++;
        }
      }
    }
  }

  const center = new THREE.Vector3(model.sizeX / 2, totalHeight / 2, model.sizeY / 2);
  const boundingRadius =
    0.5 * Math.sqrt(model.sizeX ** 2 + model.sizeY ** 2 + totalHeight ** 2) || 5;

  return {
    parts: [...groupByPart.values()],
    studs: studCount < STUD_CAP ? studs : [],
    center,
    boundingRadius,
  };
}

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

function PartInstances({ group }: { group: PartGroup }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  React.useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    group.instances.forEach((b, i) => {
      tmpObj.position.set(b.cx, b.cy, b.cz);
      tmpObj.rotation.set(0, b.rot ? Math.PI / 2 : 0, 0);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      mesh.setColorAt(i, tmpColor.set(b.hex));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [group]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, group.instances.length]}>
      <boxGeometry args={group.size} />
      <meshStandardMaterial roughness={0.5} metalness={0} />
    </instancedMesh>
  );
}

function StudInstances({ studs }: { studs: StudInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  React.useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    studs.forEach((s, i) => {
      tmpObj.position.set(s.cx, s.cy, s.cz);
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      mesh.setColorAt(i, tmpColor.set(s.hex));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [studs]);

  if (studs.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, studs.length]}>
      <cylinderGeometry args={[STUD_R, STUD_R, STUD_H, 12]} />
      <meshStandardMaterial roughness={0.45} metalness={0} />
    </instancedMesh>
  );
}

interface OrbitState {
  az: number;
  pol: number;
  rad: number;
}

function CameraRig({ controls, center }: { controls: React.MutableRefObject<OrbitState>; center: THREE.Vector3 }) {
  const { camera } = useThree();
  useFrame(() => {
    const { az, pol, rad } = controls.current;
    const sp = Math.sin(pol);
    camera.position.set(
      center.x + rad * sp * Math.sin(az),
      center.y + rad * Math.cos(pol),
      center.z + rad * sp * Math.cos(az),
    );
    camera.lookAt(center);
  });
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface Props {
  model: GeneratedModelDTO;
  maxStep?: number;
  width: number;
  height: number;
}

export function Brick3DView({ model, maxStep, width, height }: Props) {
  const scene = useMemo(() => buildScene(model, maxStep), [model, maxStep]);

  const minR = scene.boundingRadius * 0.7;
  const maxR = scene.boundingRadius * 4.5;
  const controls = useRef<OrbitState>({
    az: -0.7,
    pol: 1.05,
    rad: clamp(scene.boundingRadius / Math.sin((22.5 * Math.PI) / 180) * 1.05, minR, maxR),
  });

  // Gestes : 1 doigt = orbite, 2 doigts = zoom (pinch). Met à jour le ref
  // mutable lu par CameraRig dans useFrame (aucun re-render React).
  const last = useRef<{ mode: 'orbit' | 'pinch'; x: number; y: number; dist: number } | null>(null);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          last.current = null;
        },
        onPanResponderMove: (e) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const dist = Math.hypot(dx, dy);
            if (last.current?.mode === 'pinch' && last.current.dist > 0) {
              const ratio = last.current.dist / dist;
              controls.current.rad = clamp(controls.current.rad * ratio, minR, maxR);
            }
            last.current = { mode: 'pinch', x: 0, y: 0, dist };
          } else {
            const t = touches[0];
            if (!t) return;
            if (last.current?.mode === 'orbit') {
              controls.current.az -= (t.pageX - last.current.x) * 0.01;
              controls.current.pol = clamp(
                controls.current.pol - (t.pageY - last.current.y) * 0.01,
                0.15,
                Math.PI - 0.15,
              );
            }
            last.current = { mode: 'orbit', x: t.pageX, y: t.pageY, dist: 0 };
          }
        },
        onPanResponderRelease: () => {
          last.current = null;
        },
        onPanResponderTerminate: () => {
          last.current = null;
        },
      }),
    [minR, maxR],
  );

  return (
    <View style={{ width, height }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 0, scene.boundingRadius * 3] }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <ambientLight intensity={0.75} />
        <hemisphereLight args={['#ffffff', '#b8b2a6', 0.5]} />
        <directionalLight position={[scene.center.x + 8, scene.center.y * 2 + 12, scene.center.z + 14]} intensity={1.15} />
        <directionalLight position={[-10, 6, -8]} intensity={0.25} />
        <CameraRig controls={controls} center={scene.center} />
        {scene.parts.map((g, i) => (
          <PartInstances key={i} group={g} />
        ))}
        <StudInstances studs={scene.studs} />
      </Canvas>
      {/* Capteur de gestes transparent au-dessus du canvas */}
      <View style={{ position: 'absolute', left: 0, top: 0, width, height }} {...responder.panHandlers} />
    </View>
  );
}
