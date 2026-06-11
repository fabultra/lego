import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth';
import { prisma } from '../db';
import { ApiError, asyncHandler } from '../errors';

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

const exportSchema = z.object({
  projectId: z.string().min(1),
  onlyMissing: z.boolean().optional(),
});

async function loadModelForExport(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) throw ApiError.notFound('Projet');
  const model = await prisma.generatedModel.findUnique({
    where: { projectId },
    include: { pieces: true },
  });
  if (!model) throw ApiError.notFound('Modèle (génération non terminée ?)');
  return { project, model };
}

// --- POST /exports/bricklink ---------------------------------------------------
// Wanted List XML : importable sur bricklink.com (Want > Upload).
exportsRouter.post(
  '/bricklink',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = exportSchema.parse(req.body);
    const { project, model } = await loadModelForExport(body.projectId, req.userId);

    const counts = new Map<string, { partId: string; colorId: number; quantity: number }>();
    for (const p of model.pieces) {
      const key = `${p.pieceId}:${p.colorId}`;
      const line = counts.get(key) ?? { partId: p.pieceId, colorId: p.colorId, quantity: 0 };
      line.quantity++;
      counts.set(key, line);
    }

    if (body.onlyMissing) {
      const inv = await prisma.userInventory.findUnique({
        where: { userId: req.userId },
        include: { items: true },
      });
      for (const item of inv?.items ?? []) {
        const key = `${item.pieceId}:${item.colorId}`;
        const line = counts.get(key);
        if (line) line.quantity = Math.max(0, line.quantity - item.quantity);
      }
    }

    const items = [...counts.values()]
      .filter((l) => l.quantity > 0)
      .sort((a, b) => a.partId.localeCompare(b.partId) || a.colorId - b.colorId)
      .map(
        (l) =>
          '  <ITEM>\n' +
          '    <ITEMTYPE>P</ITEMTYPE>\n' +
          `    <ITEMID>${l.partId}</ITEMID>\n` +
          `    <COLOR>${l.colorId}</COLOR>\n` +
          `    <MINQTY>${l.quantity}</MINQTY>\n` +
          '    <CONDITION>X</CONDITION>\n' +
          '  </ITEM>',
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n${items}\n</INVENTORY>\n`;
    res
      .type('application/xml')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="brickify-${slug(project.name)}-wanted.xml"`,
      )
      .send(xml);
  }),
);

// --- POST /exports/studio --------------------------------------------------------
// Export LDraw (.ldr) : importable dans BrickLink Studio (File > Import > LDraw),
// ainsi que LeoCAD / LDView.
//
// Référentiel LDraw : Y vers le BAS, 1 tenon = 20 LDU, brique = 24 LDU,
// plaque = 8 LDU. Origine des pièces : centre du corps, plan supérieur.
// NOTE PROD : vérifier l'import dans Studio (origines de pièces + codes
// couleur) avant publication — table LDRAW_COLOR ci-dessous à auditer.
exportsRouter.post(
  '/studio',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = exportSchema.parse(req.body);
    const { project, model } = await loadModelForExport(body.projectId, req.userId);

    const parts = await prisma.legoPiece.findMany();
    const heightByPart = new Map(parts.map((p) => [p.id, p.heightPlates]));
    const dimsByPart = new Map(parts.map((p) => [p.id, { w: p.widthStuds, d: p.depthStuds }]));

    const lines: string[] = [
      `0 ${project.name}`,
      `0 Name: brickify-${slug(project.name)}.ldr`,
      '0 Author: Brickify AI',
      '0 !LICENSE Generated model',
    ];

    const baseLayers = model.baseLayers;
    const PLATE_LDU = 8;
    const BRICK_LDU = 24;
    /** Hauteur LDU du bas de la couche z (0 = sol). */
    const layerBottom = (z: number) =>
      z < baseLayers ? z * PLATE_LDU : baseLayers * PLATE_LDU + (z - baseLayers) * BRICK_LDU;

    for (const p of model.pieces) {
      const dims = dimsByPart.get(p.pieceId) ?? { w: 1, d: 1 };
      const w = p.rotated ? dims.d : dims.w;
      const d = p.rotated ? dims.w : dims.d;
      const heightLdu = (heightByPart.get(p.pieceId) ?? 3) === 1 ? PLATE_LDU : BRICK_LDU;
      const cx = (p.x + w / 2) * 20;
      const cz = (p.y + d / 2) * 20;
      // Y LDraw négatif vers le haut ; origine pièce au plan supérieur.
      const cy = -(layerBottom(p.z) + heightLdu);
      const color = LDRAW_COLOR[p.colorId] ?? 7;
      const m = p.rotated ? '0 0 1 0 1 0 -1 0 0' : '1 0 0 0 1 0 0 0 1';
      lines.push(`1 ${color} ${cx} ${cy} ${cz} ${m} ${p.pieceId}.dat`);
    }
    lines.push('0');

    res
      .type('text/plain')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="brickify-${slug(project.name)}.ldr"`,
      )
      .send(lines.join('\n'));
  }),
);

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'model'
  );
}

/**
 * Id couleur BrickLink -> code couleur LDraw.
 * À auditer contre ldraw.org/article/547 avant production.
 */
const LDRAW_COLOR: Record<number, number> = {
  1: 15, // White
  86: 71, // Light Bluish Gray
  85: 72, // Dark Bluish Gray
  11: 0, // Black
  5: 4, // Red
  59: 320, // Dark Red
  4: 25, // Orange
  110: 191, // Bright Light Orange
  3: 14, // Yellow
  103: 226, // Bright Light Yellow
  34: 27, // Lime
  36: 10, // Bright Green
  6: 2, // Green
  80: 288, // Dark Green
  156: 322, // Medium Azure
  42: 73, // Medium Blue
  7: 1, // Blue
  63: 272, // Dark Blue
  24: 22, // Purple
  47: 5, // Dark Pink
  104: 29, // Bright Pink
  2: 19, // Tan
  69: 28, // Dark Tan
  88: 70, // Reddish Brown
  120: 308, // Dark Brown
};
