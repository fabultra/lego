import { segmentSmart } from '../ml/segmenter';
import type {
  BuildStepDTO,
  GeneratedModelDTO,
  GenerationStatusDTO,
  InstructionsDTO,
  LegoColorDTO,
  PieceLineDTO,
  PiecesResponseDTO,
  UploadImageResponse,
} from '@brickify/shared';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth';
import { config } from '../config';
import { prisma } from '../db';
import { ApiError, asyncHandler } from '../errors';
import { decodeUpload, maskToPng } from '../images';
import { generationQueue } from '../jobs/queue';
import {
  fromDtoDetail,
  fromDtoSize,
  fromDtoStyle,
  serializeProject,
  stageLabel,
  toDtoStatus,
} from '../serializers';
import { storage, storageKeys } from '../storage';

const PRICE_DISCLAIMER =
  'Estimation indicative basée sur des prix moyens du marché secondaire. ' +
  'Sera remplacée par les prix BrickLink en temps réel.';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxUploadBytes },
});

const createProjectSchema = z.object({ name: z.string().min(1).max(120).optional() });

const generateSchema = z.object({
  options: z.object({
    size: z.enum(['small', 'medium', 'large']),
    detail: z.enum(['simple', 'balanced', 'detailed']),
    style: z.enum(['realistic', 'cartoon', 'pixel_art', 'blocky']),
  }),
  depthStuds: z.number().int().min(1).max(44).optional(),
});

/** Charge un projet en vérifiant qu'il appartient à l'utilisateur. */
async function getOwnedProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { images: true },
  });
  if (!project || project.userId !== userId) throw ApiError.notFound('Projet');
  return project;
}

// --- POST /projects --------------------------------------------------------
projectsRouter.post(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = createProjectSchema.parse(req.body ?? {});
    const project = await prisma.project.create({
      data: {
        userId: req.userId,
        name: body.name ?? `Projet du ${new Date().toLocaleDateString('fr-CA')}`,
      },
      include: { images: true },
    });
    res.status(201).json(await serializeProject(project));
  }),
);

// --- GET /projects ---------------------------------------------------------
projectsRouter.get(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: { images: true },
      take: 100,
    });
    res.json(await Promise.all(projects.map(serializeProject)));
  }),
);

// --- GET /projects/:id -----------------------------------------------------
projectsRouter.get(
  '/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    res.json(await serializeProject(project));
  }),
);

// --- DELETE /projects/:id --------------------------------------------------
projectsRouter.delete(
  '/:id',
  asyncHandler<AuthedRequest>(async (req, res) => {
    await getOwnedProject(req.params.id, req.userId);
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// --- POST /projects/:id/images ---------------------------------------------
// Reçoit la photo, la normalise, calcule immédiatement le masque de
// segmentation (rapide, pur TS) pour l'écran de confirmation (écran 3).
projectsRouter.post(
  '/:id/images',
  upload.single('image'),
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    if (!req.file) throw ApiError.badRequest("Champ multipart 'image' requis.");
    if (project.status === 'PROCESSING' || project.status === 'QUEUED') {
      throw ApiError.conflict('Une génération est en cours sur ce projet.');
    }

    const decoded = await decodeUpload(req.file.buffer);
    const seg = await segmentSmart(decoded.raster, decoded.normalizedJpeg);
    const maskPng = await maskToPng(seg.mask);
    console.log(`[upload] segmentation ${seg.engine} — couverture ${(seg.coverage * 100).toFixed(1)}%`);

    const sourceKey = storageKeys.source(project.id);
    const maskKey = storageKeys.maskAuto(project.id);
    await storage.put(sourceKey, decoded.normalizedJpeg, 'image/jpeg');
    await storage.put(maskKey, maskPng, 'image/png');

    // Remplace les images précédentes (une seule photo au MVP).
    await prisma.uploadedImage.deleteMany({ where: { projectId: project.id } });
    const image = await prisma.uploadedImage.create({
      data: {
        projectId: project.id,
        kind: 'SOURCE',
        storageKey: sourceKey,
        width: decoded.width,
        height: decoded.height,
        mime: 'image/jpeg',
      },
    });
    await prisma.uploadedImage.create({
      data: {
        projectId: project.id,
        kind: 'MASK_AUTO',
        storageKey: maskKey,
        width: seg.mask.width,
        height: seg.mask.height,
        mime: 'image/png',
      },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'DRAFT', progress: 0, error: null },
    });

    const response: UploadImageResponse = {
      imageId: image.id,
      sourceImageUrl: await storage.url(sourceKey),
      maskPreviewUrl: await storage.url(maskKey),
      maskCoverage: seg.coverage,
    };
    res.status(201).json(response);
  }),
);

// --- POST /projects/:id/generate -------------------------------------------
projectsRouter.post(
  '/:id/generate',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    const body = generateSchema.parse(req.body);
    if (!project.images.some((i) => i.kind === 'SOURCE')) {
      throw ApiError.badRequest("Ajouter d'abord une photo au projet.");
    }
    if (project.status === 'PROCESSING' || project.status === 'QUEUED') {
      throw ApiError.conflict('Une génération est déjà en cours.');
    }

    const job = await generationQueue.add('generate', { projectId: project.id });
    await prisma.project.update({
      where: { id: project.id },
      data: {
        size: fromDtoSize(body.options.size),
        detail: fromDtoDetail(body.options.detail),
        style: fromDtoStyle(body.options.style),
        depthStuds: body.depthStuds ?? null,
        status: 'QUEUED',
        progress: 0,
        stage: null,
        error: null,
        jobId: job.id ?? null,
      },
    });
    res.status(202).json({ jobId: job.id, status: 'queued' });
  }),
);

// --- GET /projects/:id/status ----------------------------------------------
projectsRouter.get(
  '/:id/status',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    const dto: GenerationStatusDTO = {
      status: toDtoStatus(project.status),
      progress: project.progress,
      stage: (project.stage as GenerationStatusDTO['stage']) ?? null,
      stageLabel: stageLabel(project.stage),
      error: project.error,
    };
    res.json(dto);
  }),
);

// --- GET /projects/:id/model -----------------------------------------------
projectsRouter.get(
  '/:id/model',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    const model = await prisma.generatedModel.findUnique({
      where: { projectId: project.id },
      include: { pieces: { orderBy: [{ z: 'asc' }, { y: 'asc' }, { x: 'asc' }] } },
    });
    if (!model) throw ApiError.notFound('Modèle (génération non terminée ?)');

    const partIds = [...new Set(model.pieces.map((p) => p.pieceId))];
    const parts = await prisma.legoPiece.findMany({ where: { id: { in: partIds } } });

    const dto: GeneratedModelDTO = {
      id: model.id,
      projectId: project.id,
      sizeX: model.sizeX,
      sizeY: model.sizeY,
      sizeZ: model.sizeZ,
      pieceCount: model.pieceCount,
      colorCount: model.colorCount,
      stabilityScore: model.stabilityScore,
      issues: model.issues as unknown as GeneratedModelDTO['issues'],
      bricks: model.pieces.map((p) => ({
        id: p.bid,
        partId: p.pieceId,
        colorId: p.colorId,
        x: p.x,
        y: p.y,
        z: p.z,
        rotated: p.rotated,
        stepIndex: p.stepIndex,
      })),
      colors: model.palette as unknown as LegoColorDTO[],
      parts: parts.map((p) => ({
        id: p.id,
        name: p.name,
        widthStuds: p.widthStuds,
        depthStuds: p.depthStuds,
        heightPlates: p.heightPlates,
        kind: p.kind as 'brick' | 'plate' | 'slope',
      })),
      stepCount: model.stepCount,
    };
    res.json(dto);
  }),
);

// --- GET /projects/:id/pieces?useInventory=true ------------------------------
projectsRouter.get(
  '/:id/pieces',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    const useInventory = req.query.useInventory === 'true';
    const model = await prisma.generatedModel.findUnique({
      where: { projectId: project.id },
      include: { pieces: true },
    });
    if (!model) throw ApiError.notFound('Modèle (génération non terminée ?)');

    // Agrégation part + couleur.
    const counts = new Map<string, { partId: string; colorId: number; quantity: number }>();
    for (const p of model.pieces) {
      const key = `${p.pieceId}:${p.colorId}`;
      const line = counts.get(key) ?? { partId: p.pieceId, colorId: p.colorId, quantity: 0 };
      line.quantity++;
      counts.set(key, line);
    }

    const partIds = [...new Set([...counts.values()].map((l) => l.partId))];
    const colorIds = [...new Set([...counts.values()].map((l) => l.colorId))];
    const [parts, colors] = await Promise.all([
      prisma.legoPiece.findMany({ where: { id: { in: partIds } } }),
      prisma.legoColor.findMany({ where: { id: { in: colorIds } } }),
    ]);
    const partById = new Map(parts.map((p) => [p.id, p]));
    const colorById = new Map(colors.map((c) => [c.id, c]));

    // Inventaire utilisateur (option "utiliser mes pièces").
    const owned = new Map<string, number>();
    if (useInventory) {
      const inv = await prisma.userInventory.findUnique({
        where: { userId: req.userId },
        include: { items: true },
      });
      for (const item of inv?.items ?? []) {
        owned.set(`${item.pieceId}:${item.colorId}`, item.quantity);
      }
    }

    const lines: PieceLineDTO[] = [...counts.values()]
      .map((l) => {
        const part = partById.get(l.partId)!;
        const color = colorById.get(l.colorId)!;
        const ownedQuantity = Math.min(l.quantity, owned.get(`${l.partId}:${l.colorId}`) ?? 0);
        const missingQuantity = l.quantity - ownedQuantity;
        return {
          partId: l.partId,
          partName: part.name,
          colorId: l.colorId,
          colorName: color.name,
          colorHex: color.hex,
          quantity: l.quantity,
          ownedQuantity,
          missingQuantity,
          estUnitPriceCents: part.avgPriceCents,
          estMissingCostCents: missingQuantity * part.avgPriceCents,
        };
      })
      .sort((a, b) => b.quantity - a.quantity);

    const dto: PiecesResponseDTO = {
      lines,
      totalPieces: lines.reduce((s, l) => s + l.quantity, 0),
      totalMissingPieces: lines.reduce((s, l) => s + l.missingQuantity, 0),
      estTotalCostCents: lines.reduce((s, l) => s + l.quantity * l.estUnitPriceCents, 0),
      estMissingCostCents: lines.reduce((s, l) => s + l.estMissingCostCents, 0),
      priceDisclaimer: PRICE_DISCLAIMER,
    };
    res.json(dto);
  }),
);

// --- GET /projects/:id/instructions ------------------------------------------
projectsRouter.get(
  '/:id/instructions',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const project = await getOwnedProject(req.params.id, req.userId);
    const model = await prisma.generatedModel.findUnique({
      where: { projectId: project.id },
      include: {
        steps: { orderBy: { index: 'asc' } },
        pieces: { select: { bid: true, stepIndex: true } },
      },
    });
    if (!model) throw ApiError.notFound('Modèle (génération non terminée ?)');

    const bidsByStep = new Map<number, string[]>();
    for (const p of model.pieces) {
      const arr = bidsByStep.get(p.stepIndex) ?? [];
      arr.push(p.bid);
      bidsByStep.set(p.stepIndex, arr);
    }

    const steps: BuildStepDTO[] = model.steps.map((s) => ({
      index: s.index,
      layer: s.layer,
      brickIds: bidsByStep.get(s.index) ?? [],
      pieceSummary: s.pieces as unknown as BuildStepDTO['pieceSummary'],
      note: s.note,
    }));

    const dto: InstructionsDTO = {
      modelId: model.id,
      stepCount: model.stepCount,
      layerCount: model.sizeZ,
      steps,
    };
    res.json(dto);
  }),
);
