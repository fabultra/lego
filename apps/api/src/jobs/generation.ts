import { EngineError, runPipeline, type Mask, type PipelineOptions } from '@brickify/engine';
import { prisma } from '../db';
import { decodeUpload, pngToMask } from '../images';
import { toDtoDetail, toDtoSize, toDtoStyle } from '../serializers';
import { storage, storageKeys } from '../storage';

/**
 * Traitement d'un job de génération : charge la photo, exécute le pipeline
 * du moteur, persiste modèle + pièces + étapes. Idempotent : régénérer un
 * projet remplace son modèle précédent.
 */
export async function processGeneration(
  projectId: string,
  onQueueProgress?: (pct: number) => Promise<void> | void,
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { images: true },
  });
  if (!project) throw new Error(`Projet ${projectId} introuvable`);

  const source = project.images.find((i) => i.kind === 'SOURCE');
  if (!source) throw new Error('Aucune image source pour ce projet');

  // Throttle des updates DB (le pipeline peut reporter très vite).
  let lastWrite = 0;
  const reportProgress = async (stage: string, pct: number) => {
    void onQueueProgress?.(pct);
    const now = Date.now();
    if (now - lastWrite < 300 && pct < 100) return;
    lastWrite = now;
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'PROCESSING', stage, progress: pct },
    });
  };

  try {
    const sourceBuffer = await storage.get(source.storageKey);
    const { raster } = await decodeUpload(sourceBuffer);

    // Masque corrigé par l'utilisateur, s'il existe.
    let precomputedMask: Mask | undefined;
    const edited = project.images.find((i) => i.kind === 'MASK_EDITED');
    if (edited) {
      precomputedMask = await pngToMask(await storage.get(edited.storageKey));
    }

    const options: PipelineOptions = {
      size: toDtoSize(project.size),
      detail: toDtoDetail(project.detail),
      style: toDtoStyle(project.style),
      depthStuds: project.depthStuds ?? undefined,
      precomputedMask,
    };

    const result = await runPipeline(raster, options, (stage, pct) => {
      void reportProgress(stage, Math.min(99, pct));
    });

    // Grille voxel : stockée en JSON pour le rendu/debug client.
    await storage.put(
      storageKeys.grid(projectId),
      Buffer.from(
        JSON.stringify({
          sx: result.grid.sx,
          sy: result.grid.sy,
          sz: result.grid.sz,
          data: Array.from(result.grid.data),
        }),
      ),
      'application/json',
    );

    const baseLayers = result.issues.some((i) => i.kind === 'base_added') ? 1 : 0;

    await prisma.$transaction(async (tx) => {
      await tx.generatedModel.deleteMany({ where: { projectId } });
      const model = await tx.generatedModel.create({
        data: {
          projectId,
          sizeX: result.sizeX,
          sizeY: result.sizeY,
          sizeZ: result.sizeZ,
          voxelCount: result.stats.voxelCount,
          pieceCount: result.bricks.length,
          colorCount: result.palette.length,
          stepCount: result.steps.length,
          baseLayers,
          stabilityScore: result.stabilityScore,
          issues: result.issues as object[],
          palette: result.palette.map((c) => ({ id: c.id, name: c.name, hex: c.hex })),
          stats: result.stats as unknown as object,
          gridKey: storageKeys.grid(projectId),
        },
      });
      await tx.modelPiece.createMany({
        data: result.bricks.map((b) => ({
          modelId: model.id,
          bid: b.id,
          pieceId: b.partId,
          colorId: result.palette[b.colorIndex].id,
          x: b.x,
          y: b.y,
          z: b.z,
          rotated: b.rotated,
          stepIndex: b.stepIndex,
        })),
      });
      await tx.buildStep.createMany({
        data: result.steps.map((s) => ({
          modelId: model.id,
          index: s.index,
          layer: s.layer,
          note: s.note,
          pieces: s.pieceSummary.map((p) => ({
            partId: p.partId,
            colorId: result.palette[p.colorIndex].id,
            quantity: p.quantity,
          })),
        })),
      });
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'READY', progress: 100, stage: null, error: null },
    });
  } catch (e) {
    const message =
      e instanceof EngineError
        ? e.message
        : 'La génération a échoué — réessayer ou changer de photo.';
    console.error(`[worker] génération ${projectId} en échec :`, e);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'FAILED', error: message, stage: null },
    });
    throw e;
  }
}
