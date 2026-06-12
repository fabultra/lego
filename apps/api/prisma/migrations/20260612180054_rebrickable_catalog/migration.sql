-- AlterTable
ALTER TABLE "LegoColor" ADD COLUMN     "blId" INTEGER,
ADD COLUMN     "isTrans" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LegoPiece" ADD COLUMN     "isBuildable" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "widthStuds" SET DEFAULT 0,
ALTER COLUMN "depthStuds" SET DEFAULT 0,
ALTER COLUMN "heightPlates" SET DEFAULT 0,
ALTER COLUMN "kind" SET DEFAULT 'other',
ALTER COLUMN "avgPriceCents" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "RbSet" (
    "setNum" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "numParts" INTEGER NOT NULL,

    CONSTRAINT "RbSet_pkey" PRIMARY KEY ("setNum")
);

-- CreateTable
CREATE TABLE "RbSetPart" (
    "id" TEXT NOT NULL,
    "setNum" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "colorId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "RbSetPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RbSetPart_setNum_idx" ON "RbSetPart"("setNum");

-- CreateIndex
CREATE UNIQUE INDEX "RbSetPart_setNum_partId_colorId_key" ON "RbSetPart"("setNum", "partId", "colorId");

-- AddForeignKey
ALTER TABLE "RbSetPart" ADD CONSTRAINT "RbSetPart_setNum_fkey" FOREIGN KEY ("setNum") REFERENCES "RbSet"("setNum") ON DELETE CASCADE ON UPDATE CASCADE;

-- Changement de référentiel des ids couleur (BrickLink -> Rebrickable) :
-- purge des données de test générées avec l'ancien référentiel.
DELETE FROM "ModelPiece";
DELETE FROM "BuildStep";
DELETE FROM "GeneratedModel";
DELETE FROM "InventoryPiece";
DELETE FROM "LegoColor";
