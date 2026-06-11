-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ModelSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "DetailLevel" AS ENUM ('SIMPLE', 'BALANCED', 'DETAILED');

-- CreateEnum
CREATE TYPE "StyleKind" AS ENUM ('REALISTIC', 'CARTOON', 'PIXEL_ART', 'BLOCKY');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('SOURCE', 'MASK_AUTO', 'MASK_EDITED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "error" TEXT,
    "size" "ModelSize" NOT NULL DEFAULT 'MEDIUM',
    "detail" "DetailLevel" NOT NULL DEFAULT 'BALANCED',
    "style" "StyleKind" NOT NULL DEFAULT 'REALISTIC',
    "depthStuds" INTEGER,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedModel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sizeX" INTEGER NOT NULL,
    "sizeY" INTEGER NOT NULL,
    "sizeZ" INTEGER NOT NULL,
    "voxelCount" INTEGER NOT NULL,
    "pieceCount" INTEGER NOT NULL,
    "colorCount" INTEGER NOT NULL,
    "stepCount" INTEGER NOT NULL,
    "baseLayers" INTEGER NOT NULL DEFAULT 0,
    "stabilityScore" DOUBLE PRECISION NOT NULL,
    "issues" JSONB NOT NULL,
    "palette" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "gridKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegoPiece" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthStuds" INTEGER NOT NULL,
    "depthStuds" INTEGER NOT NULL,
    "heightPlates" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "avgPriceCents" INTEGER NOT NULL,

    CONSTRAINT "LegoPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegoColor" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,

    CONSTRAINT "LegoColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPiece" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "bid" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "colorId" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "z" INTEGER NOT NULL,
    "rotated" BOOLEAN NOT NULL,
    "stepIndex" INTEGER NOT NULL,

    CONSTRAINT "ModelPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildStep" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "layer" INTEGER NOT NULL,
    "note" TEXT,
    "pieces" JSONB NOT NULL,

    CONSTRAINT "BuildStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInventory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPiece" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "colorId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "InventoryPiece_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedImage_projectId_kind_idx" ON "UploadedImage"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedModel_projectId_key" ON "GeneratedModel"("projectId");

-- CreateIndex
CREATE INDEX "ModelPiece_modelId_z_idx" ON "ModelPiece"("modelId", "z");

-- CreateIndex
CREATE INDEX "ModelPiece_modelId_stepIndex_idx" ON "ModelPiece"("modelId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPiece_modelId_bid_key" ON "ModelPiece"("modelId", "bid");

-- CreateIndex
CREATE UNIQUE INDEX "BuildStep_modelId_index_key" ON "BuildStep"("modelId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "UserInventory_userId_key" ON "UserInventory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPiece_inventoryId_pieceId_colorId_key" ON "InventoryPiece"("inventoryId", "pieceId", "colorId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedModel" ADD CONSTRAINT "GeneratedModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPiece" ADD CONSTRAINT "ModelPiece_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "GeneratedModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPiece" ADD CONSTRAINT "ModelPiece_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "LegoPiece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPiece" ADD CONSTRAINT "ModelPiece_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "LegoColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildStep" ADD CONSTRAINT "BuildStep_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "GeneratedModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInventory" ADD CONSTRAINT "UserInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPiece" ADD CONSTRAINT "InventoryPiece_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "UserInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPiece" ADD CONSTRAINT "InventoryPiece_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "LegoPiece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPiece" ADD CONSTRAINT "InventoryPiece_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "LegoColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
