/**
 * Seed minimal (exécuté à chaque boot, idempotent) : les 12 pièces générables
 * + les 25 couleurs de la palette moteur, copiées depuis @brickify/engine
 * (source de vérité unique). Le catalogue complet (50k pièces, 270 couleurs,
 * inventaires de sets) est importé séparément par le job import-rebrickable.
 */
import { PrismaClient } from '@prisma/client';
import { LEGO_PALETTE, PARTS } from '@brickify/engine';

const prisma = new PrismaClient();

async function main() {
  for (const part of Object.values(PARTS)) {
    await prisma.legoPiece.upsert({
      where: { id: part.id },
      create: {
        id: part.id,
        name: part.name,
        widthStuds: part.widthStuds,
        depthStuds: part.depthStuds,
        heightPlates: part.heightPlates,
        kind: part.kind,
        avgPriceCents: part.avgPriceCents,
        isBuildable: true,
      },
      update: {
        name: part.name,
        widthStuds: part.widthStuds,
        depthStuds: part.depthStuds,
        heightPlates: part.heightPlates,
        kind: part.kind,
        avgPriceCents: part.avgPriceCents,
        isBuildable: true,
      },
    });
  }
  for (const color of LEGO_PALETTE) {
    await prisma.legoColor.upsert({
      where: { id: color.id },
      create: { id: color.id, name: color.name, hex: color.hex, blId: color.blId },
      update: { name: color.name, hex: color.hex, blId: color.blId },
    });
  }
  console.log(`Seed OK : ${Object.keys(PARTS).length} pièces générables, ${LEGO_PALETTE.length} couleurs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
