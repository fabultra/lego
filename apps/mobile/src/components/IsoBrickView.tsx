import React, { useMemo } from 'react';
import Svg, { Ellipse, Polygon } from 'react-native-svg';
import type { GeneratedModelDTO, PlacedBrickDTO } from '../types';

/**
 * Rendu isométrique du modèle en SVG pur.
 *
 * Choix MVP assumé : pas de GL (expo-gl + three est fragile dans Expo Go et
 * alourdit le bundle). Une isométrie peinte du fond vers l'avant donne un
 * rendu "instructions LEGO" lisible et fiable partout. Le composant est
 * derrière une interface simple -> remplaçable par react-three-fiber en V1.1
 * sans toucher aux écrans.
 */

const COS = 0.866; // cos(30°)
const SIN = 0.5; // sin(30°)
const HZ = 1.05; // hauteur visuelle d'une couche (en unités tenon)
/** Au-delà de ce nombre de tenons visibles, on ne dessine plus les studs. */
const MAX_STUD_CELLS = 900;

interface Props {
  model: GeneratedModelDTO;
  /** Ne dessiner que les briques d'étape <= maxStep (vue progressive). */
  maxStep?: number;
  /** Briques de cette étape surlignées. */
  highlightStep?: number;
  width: number;
  height: number;
}

function iso(gx: number, gy: number, gz: number): [number, number] {
  return [(gx - gy) * COS, (gx + gy) * SIN - gz * HZ];
}

function shade(hex: string, factor: number): string {
  const r = Math.round(Math.min(255, parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.round(Math.min(255, parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.round(Math.min(255, parseInt(hex.slice(5, 7), 16) * factor));
  return `rgb(${r},${g},${b})`;
}

function pts(list: [number, number][]): string {
  return list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

export function IsoBrickView({ model, maxStep, highlightStep, width, height }: Props) {
  const { polys, viewBox } = useMemo(() => {
    const colorById = new Map(model.colors.map((c) => [c.id, c.hex]));
    const partById = new Map(model.parts.map((p) => [p.id, p]));

    const bricks = (maxStep ? model.bricks.filter((b) => b.stepIndex <= maxStep) : model.bricks)
      .slice()
      .sort((a, b) => a.z - b.z || a.x + a.y - (b.x + b.y));

    const dims = (b: PlacedBrickDTO) => {
      const p = partById.get(b.partId);
      const w = p ? (b.rotated ? p.depthStuds : p.widthStuds) : 1;
      const d = p ? (b.rotated ? p.widthStuds : p.depthStuds) : 1;
      return { w, d };
    };

    let totalCells = 0;
    for (const b of bricks) {
      const { w, d } = dims(b);
      totalCells += w * d;
    }
    const drawStuds = totalCells <= MAX_STUD_CELLS;

    const polys: React.ReactElement[] = [];
    let key = 0;
    for (const b of bricks) {
      const { w, d } = dims(b);
      const hex = colorById.get(b.colorId) ?? '#999999';
      const hl = highlightStep !== undefined && b.stepIndex === highlightStep;
      const dim = highlightStep !== undefined && b.stepIndex < highlightStep ? 0.92 : 1;

      const A = iso(b.x, b.y, b.z + 1);
      const B = iso(b.x + w, b.y, b.z + 1);
      const C = iso(b.x + w, b.y + d, b.z + 1);
      const D = iso(b.x, b.y + d, b.z + 1);
      const B0 = iso(b.x + w, b.y, b.z);
      const C0 = iso(b.x + w, b.y + d, b.z);
      const D0 = iso(b.x, b.y + d, b.z);

      const stroke = hl ? '#1B2A34' : 'rgba(0,0,0,0.18)';
      const sw = hl ? 0.18 : 0.05;
      polys.push(
        <Polygon key={key++} points={pts([D, C, C0, D0])} fill={shade(hex, 0.62 * dim)} stroke={stroke} strokeWidth={sw} />,
        <Polygon key={key++} points={pts([B, C, C0, B0])} fill={shade(hex, 0.8 * dim)} stroke={stroke} strokeWidth={sw} />,
        <Polygon key={key++} points={pts([A, B, C, D])} fill={shade(hex, 1 * dim)} stroke={stroke} strokeWidth={sw} />,
      );
      if (drawStuds) {
        for (let sy = 0; sy < d; sy++) {
          for (let sx = 0; sx < w; sx++) {
            const [cx, cy] = iso(b.x + sx + 0.5, b.y + sy + 0.5, b.z + 1);
            polys.push(
              <Ellipse
                key={key++}
                cx={cx}
                cy={cy}
                rx={0.27 * COS * 2}
                ry={0.27 * SIN * 2}
                fill={shade(hex, 1.12 * dim)}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth={0.03}
              />,
            );
          }
        }
      }
    }

    // Cadrage : coins extrêmes de la boîte englobante de la grille.
    const corners: [number, number][] = [];
    for (const gx of [0, model.sizeX]) {
      for (const gy of [0, model.sizeY]) {
        for (const gz of [0, model.sizeZ]) {
          corners.push(iso(gx, gy, gz));
        }
      }
    }
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const minX = Math.min(...xs) - 1;
    const minY = Math.min(...ys) - 1;
    const viewBox = `${minX} ${minY} ${Math.max(...xs) - minX + 2} ${Math.max(...ys) - minY + 2}`;
    return { polys, viewBox };
  }, [model, maxStep, highlightStep]);

  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      {polys}
    </Svg>
  );
}
