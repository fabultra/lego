/**
 * Seed du catalogue : pièces autorisées + couleurs LEGO, copiés depuis le
 * moteur (source de vérité unique : @brickify/engine).
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
      },
      update: {
        name: part.name,
        avgPriceCents: part.avgPriceCents,
      },
    });
  }
  for (const color of LEGO_PALETTE) {
    await prisma.legoColor.upsert({
      where: { id: color.id },
      create: { id: color.id, name: color.name, hex: color.hex },
      update: { name: color.name, hex: color.hex },
    });
  }
  console.log(`Seed OK : ${Object.keys(PARTS).length} pièces, ${LEGO_PALETTE.length} couleurs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
