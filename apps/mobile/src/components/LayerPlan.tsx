import React, { useMemo } from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';
import type { BuildStepDTO, GeneratedModelDTO } from '../types';

/**
 * Vue de dessus d'une étape de montage, façon notice LEGO :
 *  - empreinte des couches inférieures en gris pâle ;
 *  - briques déjà posées dans la couche courante : couleur atténuée ;
 *  - briques de l'étape : couleur pleine, contour marqué, studs visibles.
 */
interface Props {
  model: GeneratedModelDTO;
  step: BuildStepDTO;
  width: number;
  height: number;
}

export function LayerPlan({ model, step, width, height }: Props) {
  const { rects, viewBox } = useMemo(() => {
    const colorById = new Map(model.colors.map((c) => [c.id, c.hex]));
    const partById = new Map(model.parts.map((p) => [p.id, p]));
    const stepBricks = new Set(step.brickIds);

    const rects: React.ReactElement[] = [];
    let key = 0;

    for (const b of model.bricks) {
      const part = partById.get(b.partId);
      const w = part ? (b.rotated ? part.depthStuds : part.widthStuds) : 1;
      const d = part ? (b.rotated ? part.widthStuds : part.depthStuds) : 1;

      if (b.z === step.layer - 1) {
        // couche du dessous : repère de positionnement
        rects.push(
          <Rect key={key++} x={b.x} y={b.y} width={w} height={d} fill="#E2E0DA" stroke="#CFCDC6" strokeWidth={0.04} />,
        );
      } else if (b.z === step.layer) {
        const isStep = stepBricks.has(b.id);
        const placedBefore = b.stepIndex < step.index;
        if (!isStep && !placedBefore) continue; // posées plus tard : invisibles
        const hex = colorById.get(b.colorId) ?? '#999999';
        rects.push(
          <Rect
            key={key++}
            x={b.x}
            y={b.y}
            width={w}
            height={d}
            fill={hex}
            opacity={isStep ? 1 : 0.45}
            stroke={isStep ? '#1B2A34' : 'rgba(0,0,0,0.25)'}
            strokeWidth={isStep ? 0.12 : 0.04}
          />,
        );
        if (isStep) {
          for (let sy = 0; sy < d; sy++) {
            for (let sx = 0; sx < w; sx++) {
              rects.push(
                <Circle
                  key={key++}
                  cx={b.x + sx + 0.5}
                  cy={b.y + sy + 0.5}
                  r={0.27}
                  fill="rgba(255,255,255,0.35)"
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth={0.03}
                />,
              );
            }
          }
        }
      }
    }
    const viewBox = `-1 -1 ${model.sizeX + 2} ${model.sizeY + 2}`;
    return { rects, viewBox };
  }, [model, step]);

  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      {rects}
    </Svg>
  );
}
