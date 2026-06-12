import type { InventoryDTO } from '@brickify/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth';
import { prisma } from '../db';
import { ApiError, asyncHandler } from '../errors';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const upsertSchema = z.object({
  mode: z.enum(['replace', 'add']),
  items: z
    .array(
      z.object({
        partId: z.string().min(1),
        colorId: z.number().int(),
        quantity: z.number().int().min(0).max(100000),
      }),
    )
    .max(2000),
});

// --- GET /inventory ----------------------------------------------------------
inventoryRouter.get(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const inv = await prisma.userInventory.findUnique({
      where: { userId: req.userId },
      include: { items: { include: { piece: true, color: true } } },
    });
    const dto: InventoryDTO = {
      items: (inv?.items ?? []).map((i) => ({
        partId: i.pieceId,
        colorId: i.colorId,
        quantity: i.quantity,
        partName: i.piece.name,
        colorName: i.color.name,
      })),
      totalPieces: (inv?.items ?? []).reduce((s, i) => s + i.quantity, 0),
    };
    res.json(dto);
  }),
);

// --- POST /inventory (saisie manuelle MVP) ------------------------------------
inventoryRouter.post(
  '/',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const body = upsertSchema.parse(req.body);

    // Valide que les pièces/couleurs existent dans le catalogue.
    const partIds = [...new Set(body.items.map((i) => i.partId))];
    const colorIds = [...new Set(body.items.map((i) => i.colorId))];
    const [parts, colors] = await Promise.all([
      prisma.legoPiece.findMany({ where: { id: { in: partIds } }, select: { id: true } }),
      prisma.legoColor.findMany({ where: { id: { in: colorIds } }, select: { id: true } }),
    ]);
    const knownParts = new Set(parts.map((p) => p.id));
    const knownColors = new Set(colors.map((c) => c.id));
    for (const item of body.items) {
      if (!knownParts.has(item.partId)) throw ApiError.badRequest(`Pièce inconnue : ${item.partId}`);
      if (!knownColors.has(item.colorId)) throw ApiError.badRequest(`Couleur inconnue : ${item.colorId}`);
    }

    const inv = await prisma.userInventory.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId },
      update: {},
    });

    await prisma.$transaction(async (tx) => {
      if (body.mode === 'replace') {
        await tx.inventoryPiece.deleteMany({ where: { inventoryId: inv.id } });
      }
      for (const item of body.items) {
        if (body.mode === 'add') {
          await tx.inventoryPiece.upsert({
            where: {
              inventoryId_pieceId_colorId: {
                inventoryId: inv.id,
                pieceId: item.partId,
                colorId: item.colorId,
              },
            },
            create: {
              inventoryId: inv.id,
              pieceId: item.partId,
              colorId: item.colorId,
              quantity: item.quantity,
            },
            update: { quantity: { increment: item.quantity } },
          });
        } else if (item.quantity > 0) {
          await tx.inventoryPiece.create({
            data: {
              inventoryId: inv.id,
              pieceId: item.partId,
              colorId: item.colorId,
              quantity: item.quantity,
            },
          });
        }
      }
    });

    res.status(204).end();
  }),
);

const addSetSchema = z.object({
  /** Numéro de set, ex. "10696" ou "10696-1". */
  setNum: z.string().min(2).max(20),
});

// --- POST /inventory/sets -------------------------------------------------------
// "J'ai cette boîte" : importe le contenu réel d'un set (catalogue
// Rebrickable) dans l'inventaire de l'utilisateur.
inventoryRouter.post(
  '/sets',
  asyncHandler<AuthedRequest>(async (req, res) => {
    const { setNum } = addSetSchema.parse(req.body);
    // Rebrickable suffixe les sets d'une version : "10696" -> "10696-1".
    const candidates = setNum.includes('-') ? [setNum] : [`${setNum}-1`, setNum];
    const set = await prisma.rbSet.findFirst({ where: { setNum: { in: candidates } } });
    if (!set) {
      throw ApiError.notFound(
        `Set "${setNum}" (catalogue non importé ? Lancer POST /admin/import-rebrickable)`,
      );
    }
    const parts = await prisma.rbSetPart.findMany({ where: { setNum: set.setNum } });
    if (parts.length === 0) {
      throw ApiError.notFound(`Inventaire du set ${set.setNum}`);
    }

    const inv = await prisma.userInventory.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId },
      update: {},
    });
    await prisma.$transaction(
      parts.map((p) =>
        prisma.inventoryPiece.upsert({
          where: {
            inventoryId_pieceId_colorId: {
              inventoryId: inv.id,
              pieceId: p.partId,
              colorId: p.colorId,
            },
          },
          create: {
            inventoryId: inv.id,
            pieceId: p.partId,
            colorId: p.colorId,
            quantity: p.quantity,
          },
          update: { quantity: { increment: p.quantity } },
        }),
      ),
    );

    res.status(201).json({
      setNum: set.setNum,
      setName: set.name,
      year: set.year,
      partLines: parts.length,
      totalQuantity: parts.reduce((s, p) => s + p.quantity, 0),
    });
  }),
);

// --- POST /inventory/scan ------------------------------------------------------
// V2 : détection des pièces en vrac par vision (voir docs/PIPELINE.md §8).
inventoryRouter.post(
  '/scan',
  asyncHandler<AuthedRequest>(async (_req, res) => {
    res.status(501).json({
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          "Le scan de pièces par photo arrive en V2 (détection d'objets fine-tunée sur les pièces " +
          "LEGO courantes). En attendant, l'inventaire se gère via POST /inventory.",
      },
    });
  }),
);
